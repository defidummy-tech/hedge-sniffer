"use client";
import { useMemo } from "react";
import type { Asset, Hedge, Direction, FundingYield } from "../types";

/** Calculate net funding yield after hedge costs */
export function useFundingYield(
  asset: Asset, collateral: number, leverage: number,
  dir: Direction, hedges: Hedge[]
): FundingYield {
  return useMemo(function() {
    var posSize = collateral * leverage;
    var dirSign = dir === "long" ? -1 : 1;
    var hourlyIncome = dirSign * (asset.fundingRate || 0) * posSize;
    var hedgeCost = hedges.reduce(function(s, h) { return s + h.size; }, 0);

    // Rate volatility from history
    var rates = (asset.fundingRateHistory || []).map(function(f) { return f.rate; });
    var avgRate = rates.length > 0 ? rates.reduce(function(a, b) { return a + b; }, 0) / rates.length : 0;
    var variance = rates.length > 0
      ? rates.reduce(function(a, b) { return a + Math.pow(b - avgRate, 2); }, 0) / rates.length
      : 0;
    var rateVol = Math.sqrt(variance);

    // Break-even: what minimum funding rate makes the hedge free over 1 week?
    var holdingHours = 168;
    var breakEvenRate = posSize > 0 && holdingHours > 0
      ? hedgeCost / (Math.abs(dirSign) * posSize * holdingHours)
      : 0;

    // Annualized yield = (hourly income × 8760 - weekly hedge cost × 52) / collateral
    var annualFunding = hourlyIncome * 8760;
    var annualHedgeCost = hedgeCost * 52; // Re-hedge weekly

    return {
      dailyIncome: +(hourlyIncome * 24).toFixed(2),
      weeklyIncome: +(hourlyIncome * 168).toFixed(2),
      monthlyIncome: +(hourlyIncome * 720).toFixed(2),
      annualizedAPR: collateral > 0 ? +(annualFunding / collateral).toFixed(4) : 0,
      hedgeCost: hedgeCost,
      netAPR: collateral > 0 ? +((annualFunding - annualHedgeCost) / collateral).toFixed(4) : 0,
      breakEvenRate: +breakEvenRate.toFixed(8),
      rateVolatility: +rateVol.toFixed(8),
    };
  }, [asset, collateral, leverage, dir, hedges]);
}
