"use client";
import { useMemo } from "react";
import type { Asset, Deal } from "../types";

/** Scan all assets and rank by opportunity quality */
export function useDealScanner(assets: Asset[]): Deal[] {
  return useMemo(function() {
    var deals: Deal[] = [];

    for (var ai = 0; ai < assets.length; ai++) {
      var asset = assets[ai];
      if (!asset.hasPerp) continue;

      var absAPR = Math.abs(asset.fundingRateAPR || 0);

      // 1. Funding Harvest Deals (funding APR > 5%)
      if (absAPR > 0.05) {
        // Find cheapest hedge (lowest odds YES bet = cheapest protection)
        var cheapest = Infinity;
        for (var bi = 0; bi < asset.bets.length; bi++) {
          var minCost = Math.min(asset.bets[bi].currentOdds, 100 - asset.bets[bi].currentOdds);
          if (minCost < cheapest) cheapest = minCost;
        }
        var hedgeCostPer100 = cheapest < Infinity ? cheapest : 50;
        // Score: higher APR + cheaper hedge = better
        var score = absAPR * 50 + (100 - hedgeCostPer100) * 0.3;
        var dir = (asset.fundingRate || 0) > 0 ? "SHORT" : "LONG";
        deals.push({
          assetIdx: ai,
          sym: asset.sym,
          name: asset.name,
          type: "funding_harvest",
          score: +score.toFixed(1),
          fundingAPR: asset.fundingRateAPR || 0,
          bestHedgeCost: hedgeCostPer100,
          netYieldAPR: absAPR * 0.7,
          description: dir + " to earn " + (absAPR * 100).toFixed(0) + "% APR funding",
        });
      }

      // 2. Correlation Plays (strongly negatively correlated bets)
      // Quick correlation check using price history vs odds
      for (var ci = 0; ci < asset.bets.length; ci++) {
        var bet = asset.bets[ci];
        if (bet.oddsHistory.length < 10 || asset.priceHistory.length < 10) continue;
        var n = Math.min(bet.oddsHistory.length, asset.priceHistory.length, 50);
        var sumXY = 0, sumX2 = 0, sumY2 = 0;
        for (var k = 1; k < n; k++) {
          var dx = asset.priceHistory[k].price - asset.priceHistory[k - 1].price;
          var dy = bet.oddsHistory[k].odds - bet.oddsHistory[k - 1].odds;
          sumXY += dx * dy; sumX2 += dx * dx; sumY2 += dy * dy;
        }
        var denom = Math.sqrt(sumX2 * sumY2);
        var corr = denom > 0 ? sumXY / denom : 0;
        if (corr < -0.3) {
          deals.push({
            assetIdx: ai,
            sym: asset.sym,
            name: asset.name,
            type: "correlation_play",
            score: +(Math.abs(corr) * 30 + absAPR * 20).toFixed(1),
            fundingAPR: asset.fundingRateAPR || 0,
            bestHedgeCost: bet.currentOdds,
            netYieldAPR: 0,
            description: "Strong inverse hedge: " + bet.q.slice(0, 40),
          });
        }
      }

      // 3. Directional Hedge Deals (cheap bets that could create profit-both-ways)
      for (var di = 0; di < asset.bets.length; di++) {
        var dBet = asset.bets[di];
        // Cheap YES bets (< 20¢) are high-payout tail hedges
        if (dBet.currentOdds < 20 && dBet.th !== null) {
          var payout = (100 - dBet.currentOdds) / dBet.currentOdds;
          deals.push({
            assetIdx: ai,
            sym: asset.sym,
            name: asset.name,
            type: "directional_hedge",
            score: +(payout * 8 + absAPR * 10).toFixed(1),
            fundingAPR: asset.fundingRateAPR || 0,
            bestHedgeCost: dBet.currentOdds,
            netYieldAPR: 0,
            description: payout.toFixed(1) + ":1 payout — " + dBet.q.slice(0, 40),
          });
        }
      }
    }

    // Sort by score descending
    deals.sort(function(a, b) { return b.score - a.score; });
    return deals;
  }, [assets]);
}
