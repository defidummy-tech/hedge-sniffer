// ═══ Live data fetcher: Hyperliquid + Polymarket → Asset[] ═══

import type { Asset, Bet, PricePoint, OddsPoint } from "../types";
import { SEED, initAssets, genPriceHistory, genOddsHistory } from "./dataProvider";
import { MARKET_MAPPINGS, extractThreshold } from "./marketMapping";

// ── Hyperliquid fetchers ──

async function fetchHLMeta(): Promise<{ names: string[]; prices: Record<string, number> }> {
  var res = await fetch("/api/hyperliquid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "metaAndAssetCtxs" }),
  });
  if (!res.ok) throw new Error("HL meta " + res.status);
  var data = await res.json();
  // Response is [meta, assetCtxs] where meta.universe[i].name matches assetCtxs[i]
  var meta = data[0];
  var ctxs = data[1];
  var names: string[] = [];
  var prices: Record<string, number> = {};
  for (var i = 0; i < meta.universe.length; i++) {
    var name = meta.universe[i].name;
    names.push(name);
    prices[name] = parseFloat(ctxs[i].markPx);
  }
  return { names: names, prices: prices };
}

async function fetchHLCandles(coin: string): Promise<PricePoint[]> {
  var endTime = Date.now();
  var startTime = endTime - 7 * 24 * 60 * 60 * 1000; // 7 days
  var res = await fetch("/api/hyperliquid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "candleSnapshot",
      req: { coin: coin, interval: "1h", startTime: startTime, endTime: endTime },
    }),
  });
  if (!res.ok) throw new Error("HL candles " + res.status);
  var candles = await res.json();
  if (!Array.isArray(candles) || candles.length === 0) throw new Error("No candles");
  return candles.map(function(c: any, i: number) {
    return { t: i, price: parseFloat(c.c) };
  });
}

// ── Polymarket fetchers ──

interface PMMarket {
  id: string;
  question: string;
  outcomePrices: string;     // JSON string: '["0.55","0.45"]'
  clobTokenIds: string;      // JSON string: '["yes_id","no_id"]'
  volume: string;
  active: boolean;
  slug?: string;
}

interface PMEvent {
  id: string;
  title: string;
  slug: string;
  markets: PMMarket[];
}

async function fetchPMEvents(searchTerm: string): Promise<PMEvent[]> {
  var res = await fetch("/api/polymarket?endpoint=events&active=true&limit=20&order=volume&ascending=false&tag=" + encodeURIComponent(searchTerm));
  if (!res.ok) throw new Error("PM events " + res.status);
  var data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function fetchPMOddsHistory(tokenId: string): Promise<OddsPoint[]> {
  var endTs = Math.floor(Date.now() / 1000);
  var startTs = endTs - 7 * 24 * 60 * 60; // 7 days
  var res = await fetch("/api/polymarket?endpoint=prices-history&market=" + tokenId + "&startTs=" + startTs + "&endTs=" + endTs + "&fidelity=60");
  if (!res.ok) throw new Error("PM history " + res.status);
  var data = await res.json();
  if (!data.history || !Array.isArray(data.history) || data.history.length === 0) throw new Error("No history");
  return data.history.map(function(h: any, i: number) {
    return { t: i, odds: Math.round(parseFloat(h.p) * 100) };
  });
}

// ── Matching logic ──

function matchEventsToAsset(events: PMEvent[], searchTerms: string[]): PMMarket[] {
  var matched: PMMarket[] = [];
  for (var ei = 0; ei < events.length; ei++) {
    var evt = events[ei];
    var titleLower = evt.title.toLowerCase();
    var isMatch = false;
    for (var si = 0; si < searchTerms.length; si++) {
      if (titleLower.indexOf(searchTerms[si]) !== -1) { isMatch = true; break; }
    }
    if (!isMatch) continue;
    for (var mi = 0; mi < evt.markets.length; mi++) {
      var mkt = evt.markets[mi];
      if (mkt.active !== false) {
        matched.push(mkt);
      }
    }
  }
  // Sort by volume descending, take top 5
  matched.sort(function(a, b) { return parseFloat(b.volume || "0") - parseFloat(a.volume || "0"); });
  return matched.slice(0, 5);
}

function marketToBet(mkt: PMMarket, idx: number): Bet | null {
  try {
    var prices = JSON.parse(mkt.outcomePrices);
    var tokenIds = JSON.parse(mkt.clobTokenIds);
    var yesPrice = parseFloat(prices[0]);
    var currentOdds = Math.round(yesPrice * 100);
    if (currentOdds < 1 || currentOdds > 99) return null;
    return {
      id: "pm_" + mkt.id,
      q: mkt.question,
      od: currentOdds,
      v: 2,
      th: extractThreshold(mkt.question),
      url: "polymarket.com/event/" + (mkt.slug || mkt.id),
      currentOdds: currentOdds,
      oddsHistory: [],       // Filled in later
      _tokenId: tokenIds[0], // YES token for history fetch
    } as any;
  } catch {
    return null;
  }
}

// ── Main entry point ──

export async function fetchLiveAssets(): Promise<{ assets: Asset[]; liveCount: number }> {
  var liveCount = 0;

  // Step 1: Fetch Hyperliquid prices
  var hlPrices: Record<string, number> = {};
  try {
    var hlMeta = await fetchHLMeta();
    hlPrices = hlMeta.prices;
  } catch (e) {
    console.warn("Hyperliquid meta failed, using SEED prices:", e);
  }

  // Step 2: Build assets in parallel
  var assetPromises = MARKET_MAPPINGS.map(async function(mapping) {
    var seedAsset = SEED.find(function(s) { return s.sym === mapping.sym; });
    var currentPrice = hlPrices[mapping.sym] || (seedAsset ? seedAsset.pr : 0);
    if (!currentPrice) return null;

    // Fetch candle history
    var priceHistory: PricePoint[];
    var priceIsLive = false;
    if (mapping.hasPerp && hlPrices[mapping.sym]) {
      try {
        priceHistory = await fetchHLCandles(mapping.sym);
        priceIsLive = true;
      } catch {
        priceHistory = genPriceHistory(currentPrice, currentPrice * 0.01);
      }
    } else {
      priceHistory = genPriceHistory(currentPrice, currentPrice * 0.01);
    }

    // Fetch Polymarket bets
    var bets: Bet[] = [];
    var betsAreLive = false;
    try {
      var allEvents: PMEvent[] = [];
      for (var si = 0; si < mapping.searchTerms.length; si++) {
        var evts = await fetchPMEvents(mapping.searchTerms[si]);
        allEvents = allEvents.concat(evts);
      }
      var markets = matchEventsToAsset(allEvents, mapping.searchTerms);
      var rawBets: any[] = [];
      for (var mi = 0; mi < markets.length; mi++) {
        var bet = marketToBet(markets[mi], mi);
        if (bet) rawBets.push(bet);
      }

      // Fetch odds history for each bet (parallel)
      var historyResults = await Promise.allSettled(
        rawBets.map(function(b: any) { return fetchPMOddsHistory(b._tokenId); })
      );
      for (var bi = 0; bi < rawBets.length; bi++) {
        var hr = historyResults[bi];
        if (hr.status === "fulfilled" && hr.value.length > 0) {
          rawBets[bi].oddsHistory = hr.value;
        } else {
          rawBets[bi].oddsHistory = genOddsHistory(rawBets[bi].od, rawBets[bi].v);
        }
        delete rawBets[bi]._tokenId;
        bets.push(rawBets[bi]);
      }
      if (bets.length > 0) betsAreLive = true;
    } catch {
      // Polymarket failed — use SEED bets
    }

    // Fall back to SEED bets if we got none
    if (bets.length === 0 && seedAsset) {
      bets = seedAsset.bets.map(function(b) {
        return { ...b, currentOdds: b.od, oddsHistory: genOddsHistory(b.od, b.v) };
      });
    }

    if (priceIsLive || betsAreLive) liveCount++;

    return {
      sym: mapping.sym,
      name: mapping.name,
      cat: mapping.cat,
      pr: +currentPrice.toFixed(4),
      vl: currentPrice * 0.01,
      bets: bets,
      priceHistory: priceHistory,
    } as Asset;
  });

  var results = await Promise.allSettled(assetPromises);
  var assets: Asset[] = [];
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    if (r.status === "fulfilled" && r.value) {
      assets.push(r.value);
    }
  }

  // If we got nothing at all, fall back completely
  if (assets.length === 0) {
    return { assets: initAssets(), liveCount: 0 };
  }

  return { assets: assets, liveCount: liveCount };
}
