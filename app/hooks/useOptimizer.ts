"use client";
import { useState, useCallback } from "react";
import type { Asset, Hedge, Direction, OptimResult } from "../types";

export function useOptimizer(
  asset: Asset, collateral: number, leverage: number,
  entryPrice: number, minVal: number, maxVal: number,
  dir: Direction, setHedges: (h: Hedge[]) => void
) {
  var [optimizing, setOptimizing] = useState(false);
  var [optimResult, setOptimResult] = useState<OptimResult | null>(null);

  var runOpt = useCallback(function() {
    setOptimizing(true);
    setOptimResult(null);
    setTimeout(function() {
      var bScore = -Infinity, bCfg: Hedge[] = [], bMetrics: any = {};
      var sides: Array<"yes" | "no"> = ["yes", "no"], sizes = [0, 25, 50, 100, 150, 200];
      var combos: Hedge[][] = [[]];
      for (var bi = 0; bi < asset.bets.length; bi++) {
        var bet = asset.bets[bi]; var nc: Hedge[][] = [];
        for (var ci = 0; ci < combos.length; ci++) {
          nc.push(combos[ci].slice());
          for (var si = 0; si < sides.length; si++) for (var zi = 0; zi < sizes.length; zi++) { if (sizes[zi] === 0) continue; nc.push(combos[ci].concat([{ betId: bet.id, side: sides[si], size: sizes[zi] }])); }
        }
        combos = nc.slice(0, 3000);
      }
      var eMin = Math.min(minVal, entryPrice), eMax = Math.max(maxVal, entryPrice), dirM = dir === "long" ? 1 : -1;
      var sP = 20, sS = (eMax - eMin) / (sP - 1);
      var basePls: number[] = [];
      var liqP = dir === "long" ? entryPrice * (1 - 1 / leverage) : entryPrice * (1 + 1 / leverage);
      for (var ib = 0; ib < sP; ib++) { var vb = eMin + sS * ib; var isLiq = dir === "long" ? vb <= liqP : vb >= liqP; basePls.push(isLiq ? -collateral : Math.max(-collateral, dirM * leverage * ((vb - entryPrice) / entryPrice) * collateral)); }
      var baseMean = basePls.reduce(function(a, b) { return a + b; }, 0) / sP;
      var baseWorst = Math.min.apply(null, basePls);

      for (var ci2 = 0; ci2 < combos.length; ci2++) {
        var cfg = combos[ci2]; var pls: number[] = [];
        for (var i = 0; i < sP; i++) {
          var val = eMin + sS * i;
          var pl = (dir === "long" ? val <= liqP : val >= liqP) ? -collateral : Math.max(-collateral, dirM * leverage * ((val - entryPrice) / entryPrice) * collateral);
          for (var hi2 = 0; hi2 < cfg.length; hi2++) {
            var h = cfg[hi2]; var bt = asset.bets.find(function(b) { return b.id === h.betId; }); if (!bt) continue;
            var st = bt.th !== null ? entryPrice * (bt.th / asset.pr) : entryPrice * (h.side === "yes" ? 1.1 : 0.9);
            var bWins = h.side === "no" ? val <= st : val > st;
            var bOd = bt.currentOdds;
            var bProfit = h.side === "yes" ? h.size * (100 - bOd) / bOd : h.size * bOd / (100 - bOd);
            pl += bWins ? bProfit : -h.size;
          }
          pls.push(pl);
        }
        var mn = pls.reduce(function(a, b) { return a + b; }, 0) / pls.length;
        var wst = Math.min.apply(null, pls);
        var bst = Math.max.apply(null, pls);
        var cost = cfg.reduce(function(s, h) { return s + h.size; }, 0);
        var sc = mn * 1.0 + wst * 0.8 + bst * 0.15 - cost * 0.05;
        if (sc > bScore) { bScore = sc; bCfg = cfg; bMetrics = { mean: +mn.toFixed(2), worst: +wst.toFixed(2), best: +bst.toFixed(2), cost: cost, worstImprove: +(wst - baseWorst).toFixed(2), meanChange: +(mn - baseMean).toFixed(2) }; }
      }
      setHedges(bCfg);
      setOptimResult({ config: bCfg, score: +bScore.toFixed(2), metrics: bMetrics, baseMean: +baseMean.toFixed(2), baseWorst: +baseWorst.toFixed(2) });
      setOptimizing(false);
    }, 100);
  }, [asset, collateral, leverage, entryPrice, minVal, maxVal, dir, setHedges]);

  return { optimizing, optimResult, setOptimResult, runOpt };
}
