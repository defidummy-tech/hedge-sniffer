// ═══ Live data fetcher: Hyperliquid + Polymarket → Asset[] ═══
// IMPORTANT: This runs on every dashboard refresh (every 5 min).
// Minimize proxy requests — Render's server also handles cron ticks concurrently.
// Strategy: fetch meta data (prices/funding) in bulk, use synthetic charts,
// lazy-load detailed history only when user drills into a specific asset.

import type { Asset, Bet, PricePoint, OddsPoint, FundingPoint } from "../types";
import { SEED, initAssets, genPriceHistory, genOddsHistory, genFundingHistory } from "./dataProvider";
import { PRIORITY_MAPPINGS, buildAssetList, extractThreshold } from "./marketMapping";
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

/** Fetch builder dex asset data — batched 3 at a time to avoid overwhelming the server */
var KNOWN_BUILDER_DEXES = ["xyz", "flx", "vntl", "hyna", "km", "abcd", "cash", "para"];
var BD_CONCURRENCY = 3; // Max 3 concurrent builder dex queries (was 8 simultaneous)

async function fetchBuilderDexMeta(): Promise<{
  meta: HLMeta;
  assets: Array<{ coin: string; dex: string; funding: number; volume: number }>;
}> {
  var meta: HLMeta = { names: [], prices: {}, funding: {}, openInterest: {}, dayVolume: {}, premium: {} };
  var assets: Array<{ coin: string; dex: string; funding: number; volume: number }> = [];

  try {
    // Batch builder dex queries to avoid slamming the server
    for (var bi = 0; bi < KNOWN_BUILDER_DEXES.length; bi += BD_CONCURRENCY) {
      var batch = KNOWN_BUILDER_DEXES.slice(bi, bi + BD_CONCURRENCY);
      var dexResults = await Promise.allSettled(
        batch.map(async function(dexName) {
          var res = await fetch("/api/hyperliquid", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "metaAndAssetCtxs", dex: dexName }),
          });
          if (!res.ok) throw new Error("dex " + dexName + " meta " + res.status);
          var data = await res.json();
          return { dexName: dexName, meta: data[0], ctxs: data[1] };
        })
      );

      for (var dr of dexResults) {
        if (dr.status !== "fulfilled") continue;
        var dexData = dr.value;
        if (!dexData.meta || !dexData.meta.universe) continue;

        dexData.meta.universe.forEach(function(u: any, i: number) {
          var ctx = dexData.ctxs[i];
          if (!ctx) return;
          var fullCoin = dexData.dexName + ":" + u.name;
          var price = parseFloat(ctx.markPx || "0");
          var fundRate = parseFloat(ctx.funding || "0");
          var vol = parseFloat(ctx.dayNtlVlm || "0");
          if (price <= 0) return;

          meta.names.push(fullCoin);
          meta.prices[fullCoin] = price;
          meta.funding[fullCoin] = fundRate;
          meta.openInterest[fullCoin] = parseFloat(ctx.openInterest || "0");
          meta.dayVolume[fullCoin] = vol;
          meta.premium[fullCoin] = parseFloat(ctx.premium || "0");

          assets.push({ coin: fullCoin, dex: dexData.dexName, funding: fundRate, volume: vol });
        });
      }
    }
  } catch (e) {
    console.warn("Builder dex discovery failed:", e);
  }

  return { meta: meta, assets: assets };
}

// ── Detail fetchers (lazy-loaded, NOT called during initial asset list build) ──

export async function fetchHLCandles(coin: string): Promise<PricePoint[]> {
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

export async function fetchHLFundingHistory(coin: string): Promise<FundingPoint[]> {
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

export async function fetchPMEvents(searchTerm: string): Promise<PMEvent[]> {
  var res = await fetch("/api/polymarket?endpoint=events&active=true&limit=20&order=volume&ascending=false&tag=" + encodeURIComponent(searchTerm));
  if (!res.ok) throw new Error("PM events " + res.status);
  var data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchPMOddsHistory(tokenId: string): Promise<OddsPoint[]> {
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
// CRITICAL: Only fetch bulk meta data here (prices + funding for all coins).
// Do NOT fetch per-asset candles, funding history, or PM data — that was causing
// 150-200+ proxy requests per refresh, crashing the Render server.
// Charts use synthetic data; detail views can lazy-load real data if needed.

export async function fetchLiveAssets(): Promise<{ assets: Asset[]; liveCount: number }> {
  var liveCount = 0;

  // Step 1: Fetch regular Hyperliquid perps meta (1 request — prices + funding + volume + OI)
  var hlMeta: HLMeta = { names: [], prices: {}, funding: {}, openInterest: {}, dayVolume: {}, premium: {} };
  try {
    hlMeta = await fetchHLMeta();
  } catch (e) {
    console.warn("Hyperliquid meta failed, using SEED:", e);
  }

  // Step 2: Fetch builder-dex meta (3 at a time × 3 batches = 8 requests total, serialized)
  var builderDexAssets: Array<{ coin: string; dex: string; funding: number; volume: number }> = [];
  try {
    var bdResult = await fetchBuilderDexMeta();
    builderDexAssets = bdResult.assets;
    // Merge builder-dex data into hlMeta
    for (var bi = 0; bi < bdResult.meta.names.length; bi++) {
      var bName = bdResult.meta.names[bi];
      if (!hlMeta.names.includes(bName)) hlMeta.names.push(bName);
      hlMeta.prices[bName] = bdResult.meta.prices[bName];
      hlMeta.funding[bName] = bdResult.meta.funding[bName];
      hlMeta.openInterest[bName] = bdResult.meta.openInterest[bName];
      hlMeta.dayVolume[bName] = bdResult.meta.dayVolume[bName];
      hlMeta.premium[bName] = bdResult.meta.premium[bName];
    }
  } catch (e) {
    console.warn("Builder dex discovery failed:", e);
  }

  // Step 3: Build dynamic asset list
  var mappings: MarketMapping[];
  if (hlMeta.names.length > 0) {
    mappings = buildAssetList(hlMeta.names, hlMeta.funding, hlMeta.dayVolume, hlMeta.openInterest, builderDexAssets);
  } else {
    mappings = PRIORITY_MAPPINGS;
  }

  // Step 4: Build assets from meta data ONLY — no per-asset API calls.
  // This is the key fix: we already have prices, funding, OI, volume from the
  // bulk meta requests. Charts use synthetic data based on the live price/funding.
  // Total requests: 1 (main meta) + 8 (builder dex meta) = 9 requests.
  // Before this fix: 9 + (49 assets × 3-5 calls each) = 150-250 requests.
  var assets: Asset[] = [];
  for (var ci = 0; ci < mappings.length; ci++) {
    var asset = buildAssetFromMeta(mappings[ci], hlMeta);
    if (asset) {
      liveCount++;
      assets.push(asset);
    }
  }

  if (assets.length === 0) {
    return { assets: initAssets(), liveCount: 0 };
  }

  return { assets: assets, liveCount: liveCount };

  function buildAssetFromMeta(mapping: MarketMapping, meta: HLMeta): Asset | null {
    var seedAsset = SEED.find(function(s) { return s.sym === mapping.sym; });
    var currentPrice = meta.prices[mapping.sym] || (seedAsset ? seedAsset.pr : 0);
    if (!currentPrice) return null;

    var fundingRate = meta.funding[mapping.sym] || (seedAsset ? (seedAsset.fundingRate || 0) : 0);
    var oi = meta.openInterest[mapping.sym] || (seedAsset ? (seedAsset.openInterest || 0) : 0);
    var vol = meta.dayVolume[mapping.sym] || (seedAsset ? (seedAsset.dayNtlVlm || 0) : 0);
    var prem = meta.premium[mapping.sym] || 0;

    // Use synthetic chart data based on live price — no per-asset API calls
    var priceHistory = genPriceHistory(currentPrice, currentPrice * 0.01);
    var fundingHistory = fundingRate ? genFundingHistory(fundingRate) : [];

    // Use SEED bets if available (no PM API calls during bulk load)
    var bets: Bet[] = [];
    if (seedAsset) {
      bets = seedAsset.bets.map(function(b) {
        return { ...b, currentOdds: b.od, oddsHistory: genOddsHistory(b.od, b.v) };
      });
    }

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
      coin: mapping.coin,
    } as Asset;
  }
}

// ── Lazy-load detail data for a specific asset (called when user drills in) ──

export async function fetchAssetDetails(coin: string, searchTerms: string[]): Promise<{
  priceHistory: PricePoint[];
  fundingHistory: FundingPoint[];
  bets: Bet[];
}> {
  var priceHistory: PricePoint[] = [];
  var fundingHistory: FundingPoint[] = [];
  var bets: Bet[] = [];

  // Fetch candles + funding history + PM data in parallel (max 3-4 requests per asset)
  var results = await Promise.allSettled([
    fetchHLCandles(coin),
    fetchHLFundingHistory(coin),
    fetchPMForAsset(searchTerms),
  ]);

  if (results[0].status === "fulfilled") priceHistory = results[0].value;
  if (results[1].status === "fulfilled") fundingHistory = results[1].value;
  if (results[2].status === "fulfilled") bets = results[2].value;

  return { priceHistory: priceHistory, fundingHistory: fundingHistory, bets: bets };
}

async function fetchPMForAsset(searchTerms: string[]): Promise<Bet[]> {
  var allEvents: PMEvent[] = [];
  for (var si = 0; si < searchTerms.length; si++) {
    var evts = await fetchPMEvents(searchTerms[si]);
    allEvents = allEvents.concat(evts);
  }
  var markets = matchEventsToAsset(allEvents, searchTerms);
  var rawBets: any[] = [];
  for (var mi = 0; mi < markets.length; mi++) {
    var bet = marketToBet(markets[mi], mi);
    if (bet) rawBets.push(bet);
  }
  var historyResults = await Promise.allSettled(
    rawBets.map(function(b: any) { return fetchPMOddsHistory(b._tokenId); })
  );
  for (var beti = 0; beti < rawBets.length; beti++) {
    var hr = historyResults[beti];
    if (hr.status === "fulfilled" && hr.value.length > 0) {
      rawBets[beti].oddsHistory = hr.value;
    } else {
      rawBets[beti].oddsHistory = genOddsHistory(rawBets[beti].od, rawBets[beti].v);
    }
    delete rawBets[beti]._tokenId;
  }
  return rawBets;
}
