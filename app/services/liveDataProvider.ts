// ═══ Live data fetcher: Hyperliquid + Polymarket → Asset[] ═══

import type { Asset, Bet, PricePoint, OddsPoint, FundingPoint } from "../types";
import { SEED, initAssets, genPriceHistory, genOddsHistory, genFundingHistory } from "./dataProvider";
import { PRIORITY_MAPPINGS, VENTUAL_COINS, buildAssetList, extractThreshold } from "./marketMapping";
import type { MarketMapping } from "./marketMapping";

// ── Hyperliquid fetchers ──

interface HLMeta {
  names: string[];
  prices: Record<string, number>;
  funding: Record<string, number>;
  openInterest: Record<string, number>;
  dayVolume: Record<string, number>;
  premium: Record<string, number>;
}

async function fetchHLMeta(): Promise<HLMeta> {
  var res = await fetch("/api/hyperliquid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "metaAndAssetCtxs" }),
  });
  if (!res.ok) throw new Error("HL meta " + res.status);
  var data = await res.json();
  var meta = data[0];
  var ctxs = data[1];
  var names: string[] = [];
  var prices: Record<string, number> = {};
  var funding: Record<string, number> = {};
  var openInterest: Record<string, number> = {};
  var dayVolume: Record<string, number> = {};
  var premium: Record<string, number> = {};
  for (var i = 0; i < meta.universe.length; i++) {
    var name = meta.universe[i].name;
    names.push(name);
    prices[name] = parseFloat(ctxs[i].markPx || "0");
    funding[name] = parseFloat(ctxs[i].funding || "0");
    openInterest[name] = parseFloat(ctxs[i].openInterest || "0");
    dayVolume[name] = parseFloat(ctxs[i].dayNtlVlm || "0");
    premium[name] = parseFloat(ctxs[i].premium || "0");
  }
  return { names: names, prices: prices, funding: funding, openInterest: openInterest, dayVolume: dayVolume, premium: premium };
}

/** Fetch Ventuals/pre-launch token data (separate from regular perps) */
async function fetchVentualsData(coins: string[]): Promise<HLMeta> {
  var names: string[] = [];
  var prices: Record<string, number> = {};
  var funding: Record<string, number> = {};
  var openInterest: Record<string, number> = {};
  var dayVolume: Record<string, number> = {};
  var premium: Record<string, number> = {};

  var results = await Promise.allSettled(coins.map(async function(coin) {
    // sym is the part after "vntl:" — e.g. "OPENAI"
    var sym = coin.replace("vntl:", "");

    // Get price from L2 book (midprice of best bid/ask)
    var priceRes = await fetch("/api/hyperliquid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "l2Book", coin: coin }),
    });
    var midPrice = 0;
    if (priceRes.ok) {
      var book = await priceRes.json();
      if (book && book.levels && book.levels.length >= 2) {
        var bids = book.levels[0];
        var asks = book.levels[1];
        if (bids && bids.length > 0 && asks && asks.length > 0) {
          midPrice = (parseFloat(bids[0].px) + parseFloat(asks[0].px)) / 2;
        }
      }
    }

    // Get funding from last hour's history
    var startTime = Date.now() - 3600000;
    var fundRes = await fetch("/api/hyperliquid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "fundingHistory", coin: coin, startTime: startTime }),
    });
    var fundingRate = 0;
    var prem = 0;
    if (fundRes.ok) {
      var fData = await fundRes.json();
      if (Array.isArray(fData) && fData.length > 0) {
        var last = fData[fData.length - 1];
        fundingRate = parseFloat(last.fundingRate || "0");
        prem = parseFloat(last.premium || "0");
      }
    }

    return { sym: sym, midPrice: midPrice, fundingRate: fundingRate, premium: prem };
  }));

  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    if (r.status === "fulfilled" && r.value.midPrice > 0) {
      var d = r.value;
      names.push(d.sym);
      prices[d.sym] = d.midPrice;
      funding[d.sym] = d.fundingRate;
      premium[d.sym] = d.premium;
      openInterest[d.sym] = 0; // Not available from these endpoints
      dayVolume[d.sym] = 0;
    }
  }

  return { names: names, prices: prices, funding: funding, openInterest: openInterest, dayVolume: dayVolume, premium: premium };
}

async function fetchHLCandles(coin: string): Promise<PricePoint[]> {
  var endTime = Date.now();
  var startTime = endTime - 7 * 24 * 60 * 60 * 1000;
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

async function fetchHLFundingHistory(coin: string): Promise<FundingPoint[]> {
  var endTime = Date.now();
  var startTime = endTime - 7 * 24 * 60 * 60 * 1000;
  var res = await fetch("/api/hyperliquid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "fundingHistory", coin: coin, startTime: startTime }),
  });
  if (!res.ok) throw new Error("HL funding history " + res.status);
  var data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return [];
  return data.map(function(d: any) {
    var rate = parseFloat(d.fundingRate || "0");
    return { t: d.time, rate: rate, apr: rate * 8760, premium: parseFloat(d.premium || "0") };
  });
}

// ── Polymarket fetchers ──

interface PMMarket {
  id: string;
  question: string;
  outcomePrices: string;
  clobTokenIds: string;
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
  var startTs = endTs - 7 * 24 * 60 * 60;
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
      oddsHistory: [],
      _tokenId: tokenIds[0],
    } as any;
  } catch {
    return null;
  }
}

// ── Main entry point ──

export async function fetchLiveAssets(): Promise<{ assets: Asset[]; liveCount: number }> {
  var liveCount = 0;

  // Step 1: Fetch regular Hyperliquid perps meta (prices + funding + volume + OI)
  var hlMeta: HLMeta = { names: [], prices: {}, funding: {}, openInterest: {}, dayVolume: {}, premium: {} };
  try {
    hlMeta = await fetchHLMeta();
  } catch (e) {
    console.warn("Hyperliquid meta failed, using SEED:", e);
  }

  // Step 2: Fetch Ventuals/pre-launch tokens (separate API path with vntl: prefix)
  try {
    var vntlData = await fetchVentualsData(VENTUAL_COINS);
    // Merge Ventuals data into hlMeta (keyed by sym like "OPENAI", not "vntl:OPENAI")
    for (var vi = 0; vi < vntlData.names.length; vi++) {
      var vName = vntlData.names[vi];
      if (!hlMeta.names.includes(vName)) hlMeta.names.push(vName);
      hlMeta.prices[vName] = vntlData.prices[vName];
      hlMeta.funding[vName] = vntlData.funding[vName];
      hlMeta.openInterest[vName] = vntlData.openInterest[vName];
      hlMeta.dayVolume[vName] = vntlData.dayVolume[vName];
      hlMeta.premium[vName] = vntlData.premium[vName];
    }
  } catch (e) {
    console.warn("Ventuals data fetch failed:", e);
  }

  // Step 3: Build dynamic asset list (priority + discovered high-funding/volume perps)
  var mappings: MarketMapping[];
  if (hlMeta.names.length > 0) {
    mappings = buildAssetList(hlMeta.names, hlMeta.funding, hlMeta.dayVolume, hlMeta.openInterest);
  } else {
    mappings = PRIORITY_MAPPINGS;
  }

  // Step 4: Build assets in parallel
  var assetPromises = mappings.map(async function(mapping) {
    var seedAsset = SEED.find(function(s) { return s.sym === mapping.sym; });
    var currentPrice = hlMeta.prices[mapping.sym] || (seedAsset ? seedAsset.pr : 0);
    if (!currentPrice) return null;

    var fundingRate = hlMeta.funding[mapping.sym] || (seedAsset ? (seedAsset.fundingRate || 0) : 0);
    var oi = hlMeta.openInterest[mapping.sym] || (seedAsset ? (seedAsset.openInterest || 0) : 0);
    var vol = hlMeta.dayVolume[mapping.sym] || (seedAsset ? (seedAsset.dayNtlVlm || 0) : 0);
    var prem = hlMeta.premium[mapping.sym] || 0;

    // Use the coin field for HL API calls (e.g. "vntl:OPENAI" for Ventuals, "BTC" for regular)
    var hlCoin = mapping.coin;

    // Fetch candle history
    var priceHistory: PricePoint[];
    var priceIsLive = false;
    if (mapping.hasPerp && (hlMeta.prices[mapping.sym] || mapping.isVentual)) {
      try {
        priceHistory = await fetchHLCandles(hlCoin);
        priceIsLive = true;
      } catch {
        priceHistory = genPriceHistory(currentPrice, currentPrice * 0.01);
      }
    } else {
      priceHistory = genPriceHistory(currentPrice, currentPrice * 0.01);
    }

    // Fetch funding history
    var fundingHistory: FundingPoint[] = [];
    if (mapping.hasPerp && (hlMeta.prices[mapping.sym] || mapping.isVentual)) {
      try {
        fundingHistory = await fetchHLFundingHistory(hlCoin);
      } catch {
        fundingHistory = fundingRate ? genFundingHistory(fundingRate) : [];
      }
    } else if (fundingRate) {
      fundingHistory = genFundingHistory(fundingRate);
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
      // Polymarket failed
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
      fundingRate: fundingRate,
      fundingRateAPR: fundingRate * 8760,
      fundingRateHistory: fundingHistory,
      openInterest: oi,
      dayNtlVlm: vol,
      premium: prem,
      hasPerp: mapping.hasPerp,
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

  if (assets.length === 0) {
    return { assets: initAssets(), liveCount: 0 };
  }

  return { assets: assets, liveCount: liveCount };
}
