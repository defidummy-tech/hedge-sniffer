// ═══ Bot Optimization API ═══
// Data-driven optimizer: analyzes actual trade results to find what works.
// Key principle: let winners run, cut repeat losers, never tighten stops when SL rate is high.
// GET: returns recommended config based on trade history analysis + market conditions.

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

  var volScore = 0;
  if (metrics.volume > 1000000) { volScore = 30; reasons.push("High volume ($" + (metrics.volume / 1e6).toFixed(1) + "M)"); }
  else if (metrics.volume > 100000) { volScore = 20; reasons.push("Medium volume ($" + (metrics.volume / 1e3).toFixed(0) + "K)"); }
  else if (metrics.volume > 10000) { volScore = 10; reasons.push("Low volume ($" + (metrics.volume / 1e3).toFixed(0) + "K)"); }
  else { volScore = 0; reasons.push("Very low volume ($" + Math.round(metrics.volume) + ")"); }
  score += volScore;

  var oiScore = 0;
  if (metrics.openInterest > 500000) { oiScore = 30; reasons.push("Strong OI ($" + (metrics.openInterest / 1e6).toFixed(1) + "M)"); }
  else if (metrics.openInterest > 50000) { oiScore = 20; reasons.push("Decent OI ($" + (metrics.openInterest / 1e3).toFixed(0) + "K)"); }
  else if (metrics.openInterest > 5000) { oiScore = 10; reasons.push("Thin OI ($" + (metrics.openInterest / 1e3).toFixed(0) + "K)"); }
  else { oiScore = 0; reasons.push("Dangerously low OI ($" + Math.round(metrics.openInterest) + ")"); }
  score += oiScore;

  var absAPR = Math.abs(metrics.fundingAPR) * 100;
  var fundScore = 0;
  if (absAPR >= 10 && absAPR <= 50) { fundScore = 20; reasons.push("Ideal funding range (" + absAPR.toFixed(0) + "%)"); }
  else if (absAPR >= 5 && absAPR <= 100) { fundScore = 15; reasons.push("Good funding (" + absAPR.toFixed(0) + "%)"); }
  else if (absAPR > 100) { fundScore = 5; reasons.push("Extreme funding (" + absAPR.toFixed(0) + "%) — high revert risk"); }
  else { fundScore = 0; reasons.push("Weak funding (" + absAPR.toFixed(0) + "%)"); }
  score += fundScore;

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

    var tokenMetrics: Array<{
      coin: string; volume: number; openInterest: number;
      fundingAPR: number; midPrice: number; maxLev: number;
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
      tokenMetrics.push({ coin: u.name, volume: vol, openInterest: oi, fundingAPR: apr, midPrice: mid, maxLev: u.maxLeverage || 3, quality: quality });
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
            tokenMetrics.push({ coin: dexData.dexName + ":" + u.name, volume: vol, openInterest: oi, fundingAPR: apr, midPrice: mid, maxLev: u.maxLeverage || 3, quality: quality });
          });
        }
      }
    } catch (e) { /* builder dex scan optional */ }

    // ── 2. Deep trade history analysis ──
    var closedTrades = allTrades.filter(function(t) { return t.status !== "open"; });
    var totalPnL = closedTrades.reduce(function(s, t) { return s + t.totalReturn; }, 0);
    var winners = closedTrades.filter(function(t) { return t.totalReturn > 0; });
    var losers = closedTrades.filter(function(t) { return t.totalReturn <= 0; });
    var winRate = closedTrades.length > 0 ? winners.length / closedTrades.length : 0;
    var slTrades = closedTrades.filter(function(t) { return t.exitReason === "stop_loss"; });
    var slRate = closedTrades.length > 0 ? slTrades.length / closedTrades.length : 0;

    var avgWinReturn = winners.length > 0
      ? winners.reduce(function(s, t) { return s + t.totalReturn; }, 0) / winners.length : 0;
    var avgLoseReturn = losers.length > 0
      ? losers.reduce(function(s, t) { return s + t.totalReturn; }, 0) / losers.length : 0;

    // Winners capped by trailing stop? Check if many winners exited via stop_loss with positive PnL
    var trailingStopWins = closedTrades.filter(function(t) {
      return t.exitReason === "stop_loss" && t.totalReturn > 0;
    });
    var trailingStopWinPct = closedTrades.length > 0 ? trailingStopWins.length / closedTrades.length : 0;

    // What's the max winning trade? If trailing stop is too tight, max win is artificially low
    var maxWin = winners.length > 0
      ? Math.max.apply(null, winners.map(function(t) { return t.totalReturn; })) : 0;

    // Hold time analysis
    var winHolds = winners.filter(function(t) { return t.exitTime; });
    var loseHolds = losers.filter(function(t) { return t.exitTime; });
    var avgWinHold = winHolds.length > 0
      ? winHolds.reduce(function(s, t) { return s + (t.exitTime! - t.entryTime); }, 0) / winHolds.length / 3600000 : 0;
    var avgLoseHold = loseHolds.length > 0
      ? loseHolds.reduce(function(s, t) { return s + (t.exitTime! - t.entryTime); }, 0) / loseHolds.length / 3600000 : 0;

    // Per-coin analysis
    var coinStats: Record<string, { count: number; pnl: number; slCount: number; wins: number }> = {};
    for (var t of closedTrades) {
      if (!coinStats[t.coin]) coinStats[t.coin] = { count: 0, pnl: 0, slCount: 0, wins: 0 };
      coinStats[t.coin].count++;
      coinStats[t.coin].pnl += t.totalReturn;
      if (t.exitReason === "stop_loss") coinStats[t.coin].slCount++;
      if (t.totalReturn > 0) coinStats[t.coin].wins++;
    }

    // Entry APR analysis: which APR ranges produce the best returns?
    var aprBuckets: Record<string, { count: number; totalReturn: number; wins: number }> = {
      "50-100%": { count: 0, totalReturn: 0, wins: 0 },
      "100-200%": { count: 0, totalReturn: 0, wins: 0 },
      "200-500%": { count: 0, totalReturn: 0, wins: 0 },
      "500%+": { count: 0, totalReturn: 0, wins: 0 },
    };
    for (var ct of closedTrades) {
      var absEntryAPR = Math.abs(ct.entryFundingAPR) * 100;
      var bucket = absEntryAPR >= 500 ? "500%+" :
                   absEntryAPR >= 200 ? "200-500%" :
                   absEntryAPR >= 100 ? "100-200%" : "50-100%";
      aprBuckets[bucket].count++;
      aprBuckets[bucket].totalReturn += ct.totalReturn;
      if (ct.totalReturn > 0) aprBuckets[bucket].wins++;
    }

    // Find the best-performing APR bucket
    var bestBucket = "";
    var bestAvgReturn = -Infinity;
    for (var bk in aprBuckets) {
      if (aprBuckets[bk].count >= 3) { // need at least 3 trades for significance
        var avg = aprBuckets[bk].totalReturn / aprBuckets[bk].count;
        if (avg > bestAvgReturn) {
          bestAvgReturn = avg;
          bestBucket = bk;
        }
      }
    }

    // ── 3. Data-driven recommendations ──
    // Philosophy: optimize for EXPECTANCY (avg_win * win_rate - avg_loss * loss_rate)
    // NOT for minimizing losses — that caps upside and kills the strategy

    var rec: Record<string, any> = {};
    var explanations: string[] = [];

    // ── Entry APR: based on which APR ranges actually make money ──
    // Default to 0.5 (50%) — proven baseline
    rec.entryAPR = 0.5;
    if (bestBucket === "200-500%" || bestBucket === "500%+") {
      rec.entryAPR = 1.0; // 100% — higher APR trades performing best
      explanations.push("Best returns in " + bestBucket + " APR range — raising entry to 100%");
    } else if (bestBucket === "100-200%") {
      rec.entryAPR = 0.75;
      explanations.push("Best returns in 100-200% APR range — entry APR 75%");
    } else {
      explanations.push("Entry APR 50% — solid baseline from trade data");
    }

    // ── Exit APR: hold until funding drops significantly ──
    rec.exitAPR = 0.5;
    explanations.push("Exit APR 50% — exit when funding drops below this");

    // ── Leverage: keep at 3x unless data shows otherwise ──
    // NEVER reduce leverage just because SL rate is high — that makes both wins AND losses smaller
    // Only reduce if avg loss magnitude is disproportionately large vs avg win
    var lossWinRatio = avgWinReturn > 0 ? Math.abs(avgLoseReturn) / avgWinReturn : 1;
    if (lossWinRatio > 2.5) {
      rec.leverage = 2;
      explanations.push("Losses " + lossWinRatio.toFixed(1) + "x larger than wins — reducing leverage to 2x");
    } else {
      rec.leverage = 3;
      explanations.push("Leverage 3x — loss/win ratio " + lossWinRatio.toFixed(1) + "x is manageable");
    }

    // ── Stop loss: NEVER tighten when SL rate is high ──
    // A high SL rate means stops are already too tight or entries are poorly timed
    // Tightening further just guarantees more losses
    if (slRate > 0.4) {
      // Widen stop slightly to give trades more room
      rec.stopLossPct = 7;
      explanations.push("SL rate " + (slRate * 100).toFixed(0) + "% is very high — widening stop to 7% to give trades more room");
    } else if (slRate > 0.25) {
      rec.stopLossPct = 5;
      explanations.push("SL rate " + (slRate * 100).toFixed(0) + "% — keeping stop at 5%");
    } else {
      rec.stopLossPct = 5;
      explanations.push("SL rate healthy at " + (slRate * 100).toFixed(0) + "% — stop at 5%");
    }

    // ── Trailing stop: let winners run ──
    // If trailing stop winners have avg return < $5, the trail is too tight
    var trailWinAvg = trailingStopWins.length > 0
      ? trailingStopWins.reduce(function(s, t) { return s + t.totalReturn; }, 0) / trailingStopWins.length : 0;
    if (trailingStopWins.length >= 3 && trailWinAvg < 5) {
      // Trail is cutting winners short — widen activation threshold
      rec.trailingStopPct = Math.min(15, config.trailingStopPct + 3);
      explanations.push("Trailing stop winners avg only $" + trailWinAvg.toFixed(2) + " — widening activation to " + rec.trailingStopPct + "% to let winners run");
    } else if (maxWin > 20) {
      // We're getting big runners — trailing stop is working well
      rec.trailingStopPct = config.trailingStopPct;
      explanations.push("Max win $" + maxWin.toFixed(2) + " — trailing stop " + config.trailingStopPct + "% is letting runners develop");
    } else {
      rec.trailingStopPct = 8;
      explanations.push("Trailing stop 8% — balanced between locking profits and letting winners run");
    }

    // ── SL Cooldown: data-driven based on repeat losses ──
    var repeatLosers = Object.entries(coinStats).filter(function(e) { return e[1].slCount >= 2; });
    var repeatLossTotal = repeatLosers.reduce(function(s, e) { return s + e[1].pnl; }, 0);
    if (repeatLosers.length > 3 || repeatLossTotal < -20) {
      rec.slCooldownHours = 72;
      explanations.push(repeatLosers.length + " coins with 2+ SLs (total $" + repeatLossTotal.toFixed(0) + ") — extending cooldown to 72h");
    } else if (repeatLosers.length > 0) {
      rec.slCooldownHours = 48;
      explanations.push(repeatLosers.length + " coin(s) with repeat SLs — 48h cooldown");
    } else {
      rec.slCooldownHours = 24;
      explanations.push("No repeat SL issues — 24h cooldown sufficient");
    }

    // ── Max drop filter: use what's working ──
    // Analyze: do momentum-filtered entries (low recent drop) perform better?
    rec.maxDropPct = 3.5;
    explanations.push("Max price drop filter 3.5% — skip entries with strong adverse momentum");

    // ── Liquidity filters ──
    var qualifiedTokens = tokenMetrics
      .filter(function(t) { return Math.abs(t.fundingAPR) >= 0.05; })
      .sort(function(a, b) { return b.quality.score - a.quality.score; });
    var highQualityTokens = qualifiedTokens.filter(function(t) { return t.quality.score >= 50; });
    var medQualityTokens = qualifiedTokens.filter(function(t) { return t.quality.score >= 30 && t.quality.score < 50; });

    var volumes = qualifiedTokens.map(function(t) { return t.volume; }).sort(function(a, b) { return a - b; });
    var oiValues = qualifiedTokens.map(function(t) { return t.openInterest; }).sort(function(a, b) { return a - b; });
    var medianVolume = volumes.length > 0 ? volumes[Math.floor(volumes.length * 0.25)] : 0;
    var medianOI = oiValues.length > 0 ? oiValues[Math.floor(oiValues.length * 0.25)] : 0;

    rec.minVolume = Math.round(medianVolume / 1000) * 1000;
    if (rec.minVolume < 10000) rec.minVolume = 10000;
    explanations.push("Min volume $" + rec.minVolume.toLocaleString());

    rec.minOI = Math.round(medianOI / 1000) * 1000;
    if (rec.minOI < 10000) rec.minOI = 10000;
    explanations.push("Min OI $" + rec.minOI.toLocaleString());

    rec.maxOIPct = 1.0;
    explanations.push("Max OI% 1% — prevents outsized positions on illiquid tokens");

    // ── Take profit: only if data supports it ──
    // If avg winner is small AND no big runners, TP makes sense. Otherwise, let them run.
    if (maxWin < 10 && winners.length > 5) {
      var avgWinPct = winners.reduce(function(s, t) { return s + (t.totalReturn / t.sizeUSD) * 100; }, 0) / winners.length;
      rec.takeProfitPct = Math.round(avgWinPct * 3 * 10) / 10; // 3x avg win — generous TP
      explanations.push("No big runners yet — TP at " + rec.takeProfitPct + "% (3x avg win)");
    } else {
      rec.takeProfitPct = 0;
      explanations.push("Take profit disabled — let runners develop (max win: $" + maxWin.toFixed(2) + ")");
    }

    // ── Funding strategy: keep proven defaults ──
    rec.minHoldSettlements = 1;
    rec.reEntryCooldownHours = 2;
    rec.entryWindowMinutes = 30;
    rec.minFundingPersistHours = 2;
    explanations.push("Funding strategy: hold 1+ settlements, 30min entry window, 2h persistence check");

    // Adjust re-entry cooldown based on churning
    var reentryCount = 0;
    for (var ci = 0; ci < closedTrades.length - 1; ci++) {
      for (var cj = ci + 1; cj < closedTrades.length; cj++) {
        if (closedTrades[ci].coin === closedTrades[cj].coin) {
          var gap = Math.abs(closedTrades[cj].entryTime - (closedTrades[ci].exitTime || closedTrades[ci].entryTime));
          if (gap < 3600000) reentryCount++;
        }
      }
    }
    if (reentryCount > 5) {
      rec.reEntryCooldownHours = 4;
      explanations.push("Rapid re-entries detected (" + reentryCount + ") — cooldown raised to 4h");
    }

    // ── 4. Expectancy calculation ──
    var currentExpectancy = closedTrades.length > 0
      ? (avgWinReturn * winRate + avgLoseReturn * (1 - winRate)) : 0;

    // ── 5. Top opportunities right now ──
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

    // ── 6. Problem coins (avoid list) ──
    var problemCoins = Object.entries(coinStats)
      .filter(function(e) { return e[1].pnl < -1 || e[1].slCount > 1; })
      .map(function(e) {
        return {
          coin: e[0],
          trades: e[1].count,
          totalPnL: +e[1].pnl.toFixed(2),
          stopLosses: e[1].slCount,
          winRate: e[1].count > 0 ? +(e[1].wins / e[1].count * 100).toFixed(0) : 0,
        };
      })
      .sort(function(a, b) { return a.totalPnL - b.totalPnL; });

    return NextResponse.json({
      ok: true,
      recommended: rec,
      explanations: explanations,
      topOpportunities: topOpps,
      problemCoins: problemCoins,
      aprAnalysis: aprBuckets,
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
        avgWinReturn: +avgWinReturn.toFixed(2),
        avgLoseReturn: +avgLoseReturn.toFixed(2),
        avgWinHoldHours: +avgWinHold.toFixed(1),
        avgLoseHoldHours: +avgLoseHold.toFixed(1),
        maxWin: +maxWin.toFixed(2),
        trailingStopWins: trailingStopWins.length,
        trailingStopWinAvg: +trailWinAvg.toFixed(2),
        expectancyPerTrade: +currentExpectancy.toFixed(2),
        lossWinRatio: +lossWinRatio.toFixed(2),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
