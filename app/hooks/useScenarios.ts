"use client";
import { useMemo } from "react";
import type { Asset, Hedge, Scenario, RiskMetrics, PriceVariance, Direction, VarPeriod } from "../types";

/** Compute liquidation price */
export function useLiqPrice(entryPrice: number, leverage: number, dir: Direction): number {
  return useMemo(function() {
    if (leverage <= 1) return dir === "long" ? 0 : entryPrice * 100;
    if (dir === "long") return +(entryPrice * (1 - 1 / leverage)).toFixed(4);
    return +(entryPrice * (1 + 1 / leverage)).toFixed(4);
  }, [entryPrice, leverage, dir]);
}

/** Compute price variance from historical data */
export function usePriceVariance(asset: Asset, varPeriod: VarPeriod): PriceVariance {
  return useMemo(function() {
    var hours = varPeriod === "1d" ? 24 : varPeriod === "3d" ? 72 : varPeriod === "7d" ? 168 : varPeriod === "14d" ? 168 : 168;
    var start = Math.max(0, asset.priceHistory.length - hours);
    var slice = asset.priceHistory.slice(start);
    if (slice.length < 2) return { low: asset.pr * 0.95, high: asset.pr * 1.05, avg: asset.pr };
    var prices = slice.map(function(p) { return p.price; });
    var lo = Math.min.apply(null, prices);
    var hi = Math.max.apply(null, prices);
    var avg = prices.reduce(function(a, b) { return a + b; }, 0) / prices.length;
    if (varPeriod === "14d") { var range = hi - lo; lo = lo - range * 0.5; hi = hi + range * 0.5; }
    if (varPeriod === "30d") { var range2 = hi - lo; lo = lo - range2 * 1.2; hi = hi + range2 * 1.2; }
    return { low: Math.max(0, lo), high: hi, avg: avg };
  }, [asset, varPeriod]);
}

/** Compute P/L scenarios across price range, including funding P/L */
export function useScenarios(
  collateral: number, leverage: number, entryPrice: number,
  minVal: number, maxVal: number, dir: Direction,
  hedges: Hedge[], asset: Asset, liqPrice: number, priceVar: PriceVariance,
  holdingPeriodHours: number
): Scenario[] {
  return useMemo(function() {
    var eMin = Math.min(minVal, entryPrice), eMax = Math.max(maxVal, entryPrice);
    var pts = 100, step = (eMax - eMin) / (pts - 1), dirM = dir === "long" ? 1 : -1, data: Scenario[] = [];

    // Funding P/L: positive rate = longs pay shorts
    var posSize = collateral * leverage;
    var fundingDirSign = dir === "long" ? -1 : 1; // longs pay when rate > 0
    var fundingPL = (asset.fundingRate || 0) !== 0 ? +(fundingDirSign * asset.fundingRate * posSize * holdingPeriodHours).toFixed(2) : 0;

    for (var i = 0; i < pts; i++) {
      var val = +(eMin + step * i).toFixed(4);
      var isLiquidated = dir === "long" ? val <= liqPrice : val >= liqPrice;
      var perp = isLiquidated ? -collateral : dirM * leverage * ((val - entryPrice) / entryPrice) * collateral;
      perp = Math.max(-collateral, perp);
      var hPL = 0;
      for (var hi2 = 0; hi2 < hedges.length; hi2++) {
        var h = hedges[hi2];
        var bet = asset.bets.find(function(b) { return b.id === h.betId; });
        if (!bet || h.size <= 0) continue;
        var st = bet.th !== null ? entryPrice * (bet.th / asset.pr) : entryPrice * (h.side === "yes" ? 1.1 : 0.9);
        var wins = h.side === "no" ? val <= st : val > st;
        var od2 = bet.currentOdds;
        var profit2 = h.side === "yes" ? h.size * (100 - od2) / od2 : h.size * od2 / (100 - od2);
        hPL += wins ? profit2 : -h.size;
      }
      var net = perp + hPL;
      var totalNet = net + fundingPL;
      var vRounded = +val.toFixed(2);
      var inVarRange = vRounded >= +priceVar.low.toFixed(2) && vRounded <= +priceVar.high.toFixed(2);
      var belowEntry = vRounded < +entryPrice.toFixed(2);
      data.push({
        valuation: vRounded,
        perpPL: +perp.toFixed(2),
        hedgePL: +hPL.toFixed(2),
        netPL: +net.toFixed(2),
        fundingPL: fundingPL,
        totalNetPL: +totalNet.toFixed(2),
        isLiq: isLiquidated,
        pos: Math.max(0, totalNet),
        neg: Math.min(0, totalNet),
        varRed: (inVarRange && belowEntry) ? totalNet : null,
        varGreen: (inVarRange && !belowEntry) ? totalNet : null
      });
    }
    return data;
  }, [collateral, leverage, entryPrice, minVal, maxVal, dir, hedges, asset, liqPrice, priceVar, holdingPeriodHours]);
}

/** Compute risk metrics from scenarios, including funding yield */
export function useRiskMetrics(
  scenarios: Scenario[], collateral: number, leverage: number,
  entryPrice: number, dir: Direction, hedges: Hedge[], liqPrice: number,
  asset: Asset
): RiskMetrics {
  return useMemo(function() {
    var pls = scenarios.map(function(s) { return s.totalNetPL; });
    var mean = pls.reduce(function(a, b) { return a + b; }, 0) / pls.length;
    var v = pls.reduce(function(a, b) { return a + Math.pow(b - mean, 2); }, 0) / pls.length;
    var hCost = hedges.reduce(function(s, h) { return s + h.size; }, 0);
    var denom = leverage * (collateral / entryPrice);
    var dirM = dir === "long" ? 1 : -1;
    var be = denom > 0 ? +(entryPrice + dirM * (hCost / denom)).toFixed(4) : entryPrice;

    // Funding yield
    var posSize = collateral * leverage;
    var fundingDirSign = dir === "long" ? -1 : 1;
    var dailyFunding = (asset.fundingRate || 0) !== 0 ? +(fundingDirSign * asset.fundingRate * posSize * 24).toFixed(2) : 0;
    var fundingAPR = collateral > 0 ? +((dailyFunding * 365) / collateral).toFixed(4) : 0;

    return {
      breakeven: be,
      worst: Math.min.apply(null, pls),
      best: Math.max.apply(null, pls),
      vol: +Math.sqrt(v).toFixed(2),
      mean: +mean.toFixed(2),
      liqPrice: liqPrice,
      dailyFunding: dailyFunding,
      fundingAPR: fundingAPR,
    };
  }, [scenarios, collateral, leverage, entryPrice, dir, hedges, liqPrice, asset]);
}
