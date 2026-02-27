// ═══ Server-side data fetcher for cron jobs (absolute URLs, no /api proxy) ═══

import type { Asset } from "../types";
import { PRIORITY_MAPPINGS, VENTUAL_COINS, buildAssetList } from "./marketMapping";
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

/** Fetch Ventuals/pre-launch token data server-side */
async function fetchVentualsServer(coins: string[]): Promise<HLMeta> {
  var names: string[] = [];
  var prices: Record<string, number> = {};
  var funding: Record<string, number> = {};
  var openInterest: Record<string, number> = {};
  var dayVolume: Record<string, number> = {};
  var premium: Record<string, number> = {};

  var results = await Promise.allSettled(coins.map(async function(coin) {
    var sym = coin.replace("vntl:", "");

    // Get price from L2 book (midprice)
    var priceRes = await fetch(HL_API, {
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
    var fundRes = await fetch(HL_API, {
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
      openInterest[d.sym] = 0;
      dayVolume[d.sym] = 0;
    }
  }

  return { names: names, prices: prices, funding: funding, openInterest: openInterest, dayVolume: dayVolume, premium: premium };
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

  // 2. Fetch Ventuals tokens
  try {
    var vntlData = await fetchVentualsServer(VENTUAL_COINS);
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
    console.warn("Server Ventuals fetch failed:", e);
  }

  // 3. Build asset list
  var mappings: MarketMapping[];
  if (hlMeta.names.length > 0) {
    mappings = buildAssetList(hlMeta.names, hlMeta.funding, hlMeta.dayVolume, hlMeta.openInterest);
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
    });
  }

  return assets;
}
