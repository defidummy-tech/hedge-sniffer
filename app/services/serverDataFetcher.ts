// ═══ Server-side data fetcher for cron jobs (absolute URLs, no /api proxy) ═══

import type { Asset } from "../types";
import { PRIORITY_MAPPINGS, buildAssetList } from "./marketMapping";
import type { MarketMapping } from "./marketMapping";

var HL_API = "https://api.hyperliquid.xyz/info";

interface HLMeta {
  names: string[];
  prices: Record<string, number>;
  funding: Record<string, number>;
  openInterest: Record<string, number>;
  dayVolume: Record<string, number>;
  premium: Record<string, number>;
}

/** Fetch all Hyperliquid perp metadata (server-side, absolute URL) */
async function fetchHLMetaServer(): Promise<HLMeta> {
  var res = await fetch(HL_API, {
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

/** Discover all builder dexes and fetch their asset data (server-side) */
async function fetchBuilderDexMetaServer(): Promise<{
  meta: HLMeta;
  assets: Array<{ coin: string; dex: string; funding: number; volume: number }>;
}> {
  var meta: HLMeta = { names: [], prices: {}, funding: {}, openInterest: {}, dayVolume: {}, premium: {} };
  var assets: Array<{ coin: string; dex: string; funding: number; volume: number }> = [];

  try {
    var dexRes = await fetch(HL_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "perpDexs" }),
    });
    if (!dexRes.ok) return { meta: meta, assets: assets };
    var dexes: Array<{ name: string }> = await dexRes.json();
    if (!Array.isArray(dexes) || dexes.length === 0) return { meta: meta, assets: assets };

    var dexResults = await Promise.allSettled(
      dexes.map(async function(dex) {
        var res = await fetch(HL_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "metaAndAssetCtxs", dex: dex.name }),
        });
        if (!res.ok) throw new Error("dex " + dex.name + " meta " + res.status);
        var data = await res.json();
        return { dexName: dex.name, meta: data[0], ctxs: data[1] };
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
  } catch (e) {
    console.warn("Server builder dex discovery failed:", e);
  }

  return { meta: meta, assets: assets };
}

/** Fetch N-day funding rate history for a single coin (server-side) */
export async function fetchFundingHistoryServer(
  coin: string,
  lookbackDays: number
): Promise<Array<{ time: number; fundingRate: number; premium: number }>> {
  var startTime = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  var res = await fetch(HL_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "fundingHistory", coin: coin, startTime: startTime }),
  });
  if (!res.ok) throw new Error("HL fundingHistory " + res.status);
  var data = await res.json();
  if (!Array.isArray(data)) return [];
  var result: Array<{ time: number; fundingRate: number; premium: number }> = [];
  for (var i = 0; i < data.length; i++) {
    result.push({
      time: data[i].time,
      fundingRate: parseFloat(data[i].fundingRate || "0"),
      premium: parseFloat(data[i].premium || "0"),
    });
  }
  return result;
}

/** Fetch all assets server-side for cron job use. Skips candle/odds history for speed. */
export async function fetchAssetsForCron(): Promise<Asset[]> {
  // 1. Fetch regular HL perps
  var hlMeta: HLMeta = { names: [], prices: {}, funding: {}, openInterest: {}, dayVolume: {}, premium: {} };
  try {
    hlMeta = await fetchHLMetaServer();
  } catch (e) {
    console.warn("Server HL meta failed:", e);
  }

  // 2. Discover and fetch builder-dex assets
  var builderDexAssets: Array<{ coin: string; dex: string; funding: number; volume: number }> = [];
  try {
    var bdResult = await fetchBuilderDexMetaServer();
    builderDexAssets = bdResult.assets;
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
    console.warn("Server builder dex fetch failed:", e);
  }

  // 3. Build asset list
  var mappings: MarketMapping[];
  if (hlMeta.names.length > 0) {
    mappings = buildAssetList(hlMeta.names, hlMeta.funding, hlMeta.dayVolume, hlMeta.openInterest, builderDexAssets);
  } else {
    mappings = PRIORITY_MAPPINGS;
  }

  // 4. Build minimal assets (skip candle/odds history — not needed for scanning)
  var assets: Asset[] = [];
  for (var i = 0; i < mappings.length; i++) {
    var mapping = mappings[i];
    var price = hlMeta.prices[mapping.sym] || 0;
    if (!price) continue;
    var fundingRate = hlMeta.funding[mapping.sym] || 0;
    assets.push({
      sym: mapping.sym,
      name: mapping.name,
      cat: mapping.cat,
      pr: +price.toFixed(4),
      vl: price * 0.01,
      bets: [],
      priceHistory: [],
      fundingRate: fundingRate,
      fundingRateAPR: fundingRate * 8760,
      fundingRateHistory: [],
      openInterest: hlMeta.openInterest[mapping.sym] || 0,
      dayNtlVlm: hlMeta.dayVolume[mapping.sym] || 0,
      premium: hlMeta.premium[mapping.sym] || 0,
      hasPerp: true,
      coin: mapping.coin,
    });
  }

  return assets;
}
