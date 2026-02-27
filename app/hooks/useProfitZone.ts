"use client";
import { useMemo } from "react";
import type { Scenario, PriceVariance, ProfitZone } from "../types";

/** Detect the widest contiguous zone where totalNetPL > 0 spanning both sides of entry */
export function useProfitZone(
  scenarios: Scenario[],
  entryPrice: number,
  priceVar: PriceVariance
): ProfitZone | null {
  return useMemo(function() {
    if (scenarios.length < 3) return null;

    // Find entry index
    var entryIdx = -1;
    for (var i = 0; i < scenarios.length; i++) {
      if (scenarios[i].valuation >= entryPrice) { entryIdx = i; break; }
    }
    if (entryIdx < 0) return null;

    // Check if entry point is profitable
    if (scenarios[entryIdx].totalNetPL <= 0) return null;

    // Expand left from entry
    var leftIdx = entryIdx;
    while (leftIdx > 0 && scenarios[leftIdx - 1].totalNetPL > 0) {
      leftIdx--;
    }

    // Expand right from entry
    var rightIdx = entryIdx;
    while (rightIdx < scenarios.length - 1 && scenarios[rightIdx + 1].totalNetPL > 0) {
      rightIdx++;
    }

    // Must span both sides of entry
    if (scenarios[leftIdx].valuation >= entryPrice || scenarios[rightIdx].valuation <= entryPrice) {
      return null;
    }

    var lowPrice = scenarios[leftIdx].valuation;
    var highPrice = scenarios[rightIdx].valuation;
    var minProfit = Infinity;
    for (var j = leftIdx; j <= rightIdx; j++) {
      if (scenarios[j].totalNetPL < minProfit) minProfit = scenarios[j].totalNetPL;
    }

    var widthPct = entryPrice > 0 ? (highPrice - lowPrice) / entryPrice : 0;

    // How much of the price variance range is covered?
    var varRange = priceVar.high - priceVar.low;
    var overlapLow = Math.max(lowPrice, priceVar.low);
    var overlapHigh = Math.min(highPrice, priceVar.high);
    var varianceCoverage = varRange > 0 ? Math.max(0, (overlapHigh - overlapLow) / varRange) : 0;

    return {
      lowPrice: +lowPrice.toFixed(2),
      highPrice: +highPrice.toFixed(2),
      minProfit: +minProfit.toFixed(2),
      widthPct: +widthPct.toFixed(4),
      varianceCoverage: +varianceCoverage.toFixed(4),
    };
  }, [scenarios, entryPrice, priceVar]);
}
