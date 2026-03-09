// ═══ Bot Optimization API ═══
// Analyzes current market conditions and trade history to recommend optimal parameters.
// GET: returns recommended config based on live token metrics + past performance.

import { NextResponse } from "next/server";
import * as journal from "../../../services/tradeJournal";

export var dynamic = "force-dynamic";

var HL_INFO_URL = "https://api.hyperliquid.xyz/info";

async function hlPost(body: any): Promise<any> {
  var res = await fetch(HL_INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("HL API " + res.status);
  return res.json();
}

// Token quality score: 0-100 based on liquidity, volume, OI, and funding stability
function scoreToken(metrics: {
  volume: number;
  openInterest: number;
  fundingAPR: number;
  midPrice: number;
}): { score: number; reasons: string[] } {
  var score = 0;
  var reasons: string[] = [];

  // Volume score (0-30): higher is better, log scale
  var volScore = 0;
  if (metrics.volume > 1000000) { volScore = 30; reasons.push("High volume ($" + (metrics.volume / 1e6).toFixed(1) + "M)"); }
  else if (metrics.volume > 100000) { volScore = 20; reasons.push("Medium volume ($" + (metrics.volume / 1e3).toFixed(0) + "K)"); }
  else if (metrics.volume > 10000) { volScore = 10; reasons.push("Low volume ($" + (metrics.volume / 1e3).toFixed(0) + "K)"); }
  else { volScore = 0; reasons.push("Very low volume ($" + Math.round(metrics.volume) + ")"); }
  score += volScore;

  // OI score (0-30): higher OI = more liquid for exits
  var oiScore = 0;
  if (metrics.openInterest > 500000) { oiScore = 30; reasons.push("Strong OI ($" + (metrics.openInterest / 1e6).toFixed(1) + "M)"); }
  else if (metrics.openInterest > 50000) { oiScore = 20; reasons.push("Decent OI ($" + (metrics.openInterest / 1e3).toFixed(0) + "K)"); }
  else if (metrics.openInterest > 5000) { oiScore = 10; reasons.push("Thin OI ($" + (metrics.openInterest / 1e3).toFixed(0) + "K)"); }
  else { oiScore = 0; reasons.push("Dangerously low OI ($" + Math.round(metrics.openInterest) + ")"); }
  score += oiScore;

  // Funding magnitude score (0-20): sweet spot is 10-50% APR
  var absAPR = Math.abs(metrics.fundingAPR) * 100; // to %
  var fundScore = 0;
  if (absAPR >= 10 && absAPR <= 50) { fundScore = 20; reasons.push("Ideal funding range (" + absAPR.toFixed(0) + "%)"); }
  else if (absAPR >= 5 && absAPR <= 100) { fundScore = 15; reasons.push("Good funding (" + absAPR.toFixed(0) + "%)"); }
  else if (absAPR > 100) { fundScore = 5; reasons.push("Extreme funding (" + absAPR.toFixed(0) + "%) — high revert risk"); }
  else { fundScore = 0; reasons.push("Weak funding (" + absAPR.toFixed(0) + "%)"); }
  score += fundScore;

  // Volume/OI ratio (0-20): higher ratio means more active market
  var voRatio = metrics.openInterest > 0 ? metrics.volume / metrics.openInterest : 0;
  var ratioScore = 0;
  if (voRatio > 2) { ratioScore = 20; reasons.push("Very active turnover"); }
  else if (voRatio > 0.5) { ratioScore = 15; reasons.push("Good turnover"); }
  else if (voRatio > 0.1) { ratioScore = 10; reasons.push("Moderate turnover"); }
  else { ratioScore = 5; reasons.push("Low turnover"); }
  score += ratioScore;

  return { score: score, reasons: reasons };
}

export async function GET() {
  try {
    var config = await journal.getConfig();
    var allTrades = await journal.getAllTrades();

    // ── 1. Fetch live market data ──
    var metaCtx = await hlPost({ type: "metaAndAssetCtxs" });
    var meta = metaCtx[0];
    var assetCtxs = metaCtx[1];

    // Build token metrics for all assets with significant funding
    var tokenMetrics: Array<{
      coin: string;
      volume: number;
      openInterest: number;
      fundingAPR: number;
      midPrice: number;
      maxLev: number;
      quality: { score: number; reasons: string[] };
    }> = [];

    meta.universe.forEach(function(u: any, i: number) {
      var ctx = assetCtxs[i];
      if (!ctx || !ctx.funding) return;
      var rate = parseFloat(ctx.funding);
      var apr = rate * 8760;
      var mid = parseFloat(ctx.midPx || ctx.markPx || "0");
      var vol = parseFloat(ctx.dayNtlVlm || "0");
      var oi = parseFloat(ctx.openInterest || "0");
      if (mid <= 0) return;

      var quality = scoreToken({ volume: vol, openInterest: oi, fundingAPR: apr, midPrice: mid });

      tokenMetrics.push({
        coin: u.name,
        volume: vol,
        openInterest: oi,
        fundingAPR: apr,
        midPrice: mid,
        maxLev: u.maxLeverage || 3,
        quality: quality,
      });
    });

    // Also scan builder dexes
    try {
      var dexes: Array<{ name: string }> = await hlPost({ type: "perpDexs" });
      if (Array.isArray(dexes)) {
        var dexResults = await Promise.allSettled(
          dexes.map(async function(dex) {
            var dexMeta = await hlPost({ type: "metaAndAssetCtxs", dex: dex.name });
            return { dexName: dex.name, meta: dexMeta[0], ctxs: dexMeta[1] };
          })
        );
        for (var dr of dexResults) {
          if (dr.status !== "fulfilled") continue;
          var dexData = dr.value;
          if (!dexData.meta || !dexData.meta.universe) continue;
          dexData.meta.universe.forEach(function(u: any, idx: number) {
            var ctx = dexData.ctxs[idx];
            if (!ctx) return;
            var rate = parseFloat(ctx.funding || "0");
            var mid = parseFloat(ctx.midPx || ctx.markPx || "0");
            var vol = parseFloat(ctx.dayNtlVlm || "0");
            var oi = parseFloat(ctx.openInterest || "0");
            if (mid <= 0) return;
            var apr = rate * 8760;
            var quality = scoreToken({ volume: vol, openInterest: oi, fundingAPR: apr, midPrice: mid });
            tokenMetrics.push({
              coin: dexData.dexName + ":" + u.name,
              volume: vol,
              openInterest: oi,
              fundingAPR: apr,
              midPrice: mid,
              maxLev: u.maxLeverage || 3,
              quality: quality,
            });
          });
        }
      }
    } catch (e) { /* builder dex scan optional */ }

    // ── 2. Analyze trade history ──
    var closedTrades = allTrades.filter(function(t) { return t.status !== "open"; });
    var totalPnL = closedTrades.reduce(function(s, t) { return s + t.totalReturn; }, 0);
    var winCount = closedTrades.filter(function(t) { return t.totalReturn > 0; }).length;
    var winRate = closedTrades.length > 0 ? winCount / closedTrades.length : 0;
    var slCount = closedTrades.filter(function(t) { return t.exitReason === "stop_loss"; }).length;
    var slRate = closedTrades.length > 0 ? slCount / closedTrades.length : 0;

    // Calculate avg hold time for winning vs losing trades
    var winHolds = closedTrades.filter(function(t) { return t.totalReturn > 0 && t.exitTime; });
    var loseHolds = closedTrades.filter(function(t) { return t.totalReturn <= 0 && t.exitTime; });
    var avgWinHold = winHolds.length > 0
      ? winHolds.reduce(function(s, t) { return s + (t.exitTime! - t.entryTime); }, 0) / winHolds.length / 3600000
      : 0;
    var avgLoseHold = loseHolds.length > 0
      ? loseHolds.reduce(function(s, t) { return s + (t.exitTime! - t.entryTime); }, 0) / loseHolds.length / 3600000
      : 0;

    // Per-coin analysis: which coins were profitable
    var coinStats: Record<string, { count: number; pnl: number; slCount: number }> = {};
    for (var t of closedTrades) {
      if (!coinStats[t.coin]) coinStats[t.coin] = { count: 0, pnl: 0, slCount: 0 };
      coinStats[t.coin].count++;
      coinStats[t.coin].pnl += t.totalReturn;
      if (t.exitReason === "stop_loss") coinStats[t.coin].slCount++;
    }

    // ── 3. Calculate recommended parameters ──

    // Sort current opportunities by quality score
    var qualifiedTokens = tokenMetrics
      .filter(function(t) { return Math.abs(t.fundingAPR) >= 0.05; }) // 5% APR minimum
      .sort(function(a, b) { return b.quality.score - a.quality.score; });

    // Recommended entry APR: based on median quality of available tokens
    var highQualityTokens = qualifiedTokens.filter(function(t) { return t.quality.score >= 50; });
    var medQualityTokens = qualifiedTokens.filter(function(t) { return t.quality.score >= 30 && t.quality.score < 50; });

    // Volume distribution of qualified tokens
    var volumes = qualifiedTokens.map(function(t) { return t.volume; }).sort(function(a, b) { return a - b; });
    var oiValues = qualifiedTokens.map(function(t) { return t.openInterest; }).sort(function(a, b) { return a - b; });
    var medianVolume = volumes.length > 0 ? volumes[Math.floor(volumes.length * 0.25)] : 0; // 25th percentile
    var medianOI = oiValues.length > 0 ? oiValues[Math.floor(oiValues.length * 0.25)] : 0;

    // Recommended config
    var rec: Record<string, any> = {};
    var explanations: string[] = [];

    // Entry APR: if many high-quality tokens available, be selective. If few, lower bar.
    if (highQualityTokens.length > 5) {
      rec.entryAPR = 0.15; // 15%
      explanations.push("Many high-quality opportunities available — recommended entry APR: 15%");
    } else if (highQualityTokens.length > 0) {
      rec.entryAPR = 0.10; // 10%
      explanations.push("Some high-quality opportunities — recommended entry APR: 10%");
    } else {
      rec.entryAPR = 0.20; // 20% — be very selective with lower-quality tokens
      explanations.push("Few quality opportunities — recommended entry APR: 20% (be selective)");
    }

    // Min volume: use 25th percentile of current market
    rec.minVolume = Math.round(medianVolume / 1000) * 1000;
    if (rec.minVolume < 10000) rec.minVolume = 10000;
    explanations.push("Min volume $" + rec.minVolume.toLocaleString() + " (25th percentile of current market)");

    // Min OI: use 25th percentile
    rec.minOI = Math.round(medianOI / 1000) * 1000;
    if (rec.minOI < 10000) rec.minOI = 10000;
    explanations.push("Min OI $" + rec.minOI.toLocaleString() + " (25th percentile)");

    // Max OI%: cap position at 1% of OI to avoid being too significant
    rec.maxOIPct = 1.0;
    explanations.push("Max OI% 1% — prevents outsized positions on illiquid tokens");

    // Max drop: based on SL rate from history
    if (slRate > 0.3) {
      rec.maxDropPct = 5;
      explanations.push("High stop-loss rate (" + (slRate * 100).toFixed(0) + "%) — recommend 5% max price drop filter");
    } else if (slRate > 0.15) {
      rec.maxDropPct = 10;
      explanations.push("Moderate SL rate (" + (slRate * 100).toFixed(0) + "%) — recommend 10% max drop filter");
    } else {
      rec.maxDropPct = 15;
      explanations.push("Low SL rate — recommend 15% max drop filter");
    }

    // Stop loss: if avg losing hold is very short, tighten SL
    if (slRate > 0.25 && config.stopLossPct > 3) {
      rec.stopLossPct = 3;
      explanations.push("Many stop-losses triggering — tighten to 3%");
    }

    // SL Cooldown: if same coins get stopped repeatedly
    var repeatSL = Object.values(coinStats).filter(function(c) { return c.slCount > 1; });
    if (repeatSL.length > 0) {
      rec.slCooldownHours = 48;
      explanations.push("Multiple SLs on same coins detected — recommend 48h cooldown");
    } else {
      rec.slCooldownHours = 24;
      explanations.push("SL cooldown 24h recommended");
    }

    // Take profit: if winning trades show pattern
    if (winHolds.length > 3) {
      var avgWinPct = winHolds.reduce(function(s, t) { return s + (t.totalReturn / t.sizeUSD) * 100; }, 0) / winHolds.length;
      if (avgWinPct > 0.5) {
        rec.takeProfitPct = Math.round(avgWinPct * 2 * 10) / 10; // 2x avg win
        explanations.push("Avg winning trade: " + avgWinPct.toFixed(1) + "% — recommend TP at " + rec.takeProfitPct + "%");
      }
    }

    // Funding strategy recommendations
    rec.minHoldSettlements = 1;
    explanations.push("Min hold 1 settlement — ensures at least one funding accrual per trade");
    rec.reEntryCooldownHours = 2;
    explanations.push("Re-entry cooldown 2h — prevents churning same coin repeatedly");
    rec.entryWindowMinutes = 30;
    explanations.push("Entry window 30min — only enter near funding settlement for immediate accrual");
    rec.minFundingPersistHours = 2;
    explanations.push("Funding persistence 2h — avoid entering on transient funding spikes");

    // Adjust re-entry cooldown based on trade history
    var reentryCount = 0;
    for (var ci = 0; ci < closedTrades.length - 1; ci++) {
      for (var cj = ci + 1; cj < closedTrades.length; cj++) {
        if (closedTrades[ci].coin === closedTrades[cj].coin) {
          var gap = Math.abs(closedTrades[cj].entryTime - (closedTrades[ci].exitTime || closedTrades[ci].entryTime));
          if (gap < 3600000) reentryCount++; // re-entered within 1 hour
        }
      }
    }
    if (reentryCount > 5) {
      rec.reEntryCooldownHours = 4;
      explanations.push("Many rapid re-entries detected (" + reentryCount + ") — increased cooldown to 4h");
    }

    // ── 4. Top opportunities right now ──
    var topOpps = qualifiedTokens.slice(0, 10).map(function(t) {
      return {
        coin: t.coin,
        fundingAPR: +(t.fundingAPR * 100).toFixed(1),
        direction: t.fundingAPR > 0 ? "short" : "long",
        volume: Math.round(t.volume),
        openInterest: Math.round(t.openInterest),
        qualityScore: t.quality.score,
        reasons: t.quality.reasons,
      };
    });

    // ── 5. Problem coins (avoid list) ──
    var problemCoins = Object.entries(coinStats)
      .filter(function(e) { return e[1].pnl < -1 || e[1].slCount > 1; })
      .map(function(e) {
        return {
          coin: e[0],
          trades: e[1].count,
          totalPnL: +e[1].pnl.toFixed(2),
          stopLosses: e[1].slCount,
        };
      })
      .sort(function(a, b) { return a.totalPnL - b.totalPnL; });

    return NextResponse.json({
      ok: true,
      recommended: rec,
      explanations: explanations,
      topOpportunities: topOpps,
      problemCoins: problemCoins,
      marketSummary: {
        totalPerps: tokenMetrics.length,
        aboveEntryAPR: qualifiedTokens.length,
        highQuality: highQualityTokens.length,
        medQuality: medQualityTokens.length,
        medianVolume: Math.round(medianVolume),
        medianOI: Math.round(medianOI),
      },
      tradeHistory: {
        total: closedTrades.length,
        totalPnL: +totalPnL.toFixed(2),
        winRate: +(winRate * 100).toFixed(1),
        slRate: +(slRate * 100).toFixed(1),
        avgWinHoldHours: +avgWinHold.toFixed(1),
        avgLoseHoldHours: +avgLoseHold.toFixed(1),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
