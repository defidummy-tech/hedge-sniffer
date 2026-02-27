"use client";
import HelpDot from "./HelpDot";
import { C } from "../utils/constants";
import type { Asset, OptimResult, OptimizerMode } from "../types";

interface OptimizerResultProps {
  optimResult: OptimResult;
  asset: Asset;
  collateral: number;
  mode: OptimizerMode;
}

export default function OptimizerResult({ optimResult, asset, collateral, mode }: OptimizerResultProps) {
  var hasFunding = (optimResult.metrics.fundingPL || 0) !== 0;
  var netYieldAPR = optimResult.metrics.netYieldAPR || 0;

  var modeLabel = mode === "funding_harvest" ? "Funding Harvest" : mode === "directional" ? "Directional" : "Balanced";

  return (
    <div style={{ padding: "10px 12px", borderRadius: 8, background: C.sL, border: "1px solid " + C.y + "30", fontSize: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ color: C.y, fontWeight: 700, fontSize: 12 }}>OPTIMIZATION RESULT</span>
        <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: C.a + "18", color: C.a, fontWeight: 700 }}>{modeLabel}</span>
      </div>
      <div style={{ color: C.tx, marginBottom: 4 }}>
        <strong>Composite Score: {optimResult.score}</strong>
        <HelpDot text={"Mode: " + modeLabel + "\n\n" + (mode === "funding_harvest" ? "Score = Net Yield\u00D72.0 + Worst\u00D71.5 + Mean\u00D70.5 \u2212 Cost\u00D70.02\nOptimized for maximum funding income with downside protection." : mode === "directional" ? "Score = Mean\u00D71.2 + Worst\u00D70.5 + Best\u00D70.3 \u2212 Cost\u00D70.05\nOptimized for directional profit with asymmetric upside." : "Score = Mean\u00D71.0 + Worst\u00D70.8 + Best\u00D70.15 \u2212 Cost\u00D70.05\nBalanced between profit, protection, and cost.")} pos="right" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 6, fontSize: 10 }}>
        <div style={{ color: C.txM }}>Avg P/L: <span style={{ color: optimResult.metrics.mean >= 0 ? C.g : C.r, fontWeight: 600 }}>${optimResult.metrics.mean}</span></div>
        <div style={{ color: C.txM }}>Worst: <span style={{ color: C.r, fontWeight: 600 }}>${optimResult.metrics.worst}</span></div>
        <div style={{ color: C.txM }}>Best: <span style={{ color: C.g, fontWeight: 600 }}>${optimResult.metrics.best}</span></div>
        <div style={{ color: C.txM }}>Hedge Cost: <span style={{ color: C.o, fontWeight: 600 }}>${optimResult.metrics.cost}</span></div>
      </div>

      {hasFunding && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 6, fontSize: 10, paddingTop: 4, borderTop: "1px solid " + C.b }}>
          <div style={{ color: C.txM }}>Funding P/L: <span style={{ color: optimResult.metrics.fundingPL >= 0 ? C.g : C.r, fontWeight: 600 }}>${optimResult.metrics.fundingPL}</span></div>
          <div style={{ color: C.txM }}>Net Yield: <span style={{ color: netYieldAPR >= 0 ? C.g : C.r, fontWeight: 700, fontSize: 11 }}>{(netYieldAPR * 100).toFixed(1)}% APR</span></div>
        </div>
      )}

      <div style={{ borderTop: "1px solid " + C.b, paddingTop: 6, marginBottom: 4 }}>
        <div style={{ fontSize: 10, color: C.txM }}>vs. No Hedge: Worst case <span style={{ color: optimResult.metrics.worstImprove > 0 ? C.g : C.r, fontWeight: 600 }}>{optimResult.metrics.worstImprove > 0 ? "+" : ""}{optimResult.metrics.worstImprove}</span> · Avg P/L <span style={{ color: optimResult.metrics.meanChange > 0 ? C.g : C.r, fontWeight: 600 }}>{optimResult.metrics.meanChange > 0 ? "+" : ""}{optimResult.metrics.meanChange}</span></div>
      </div>
      {optimResult.config.length > 0 && (<div style={{ marginBottom: 4 }}>
        {optimResult.config.map(function(h) { var bet = asset.bets.find(function(b) { return b.id === h.betId; }); return <div key={h.betId} style={{ color: C.tx, fontSize: 10 }}><span style={{ color: h.side === "no" ? C.o : C.g, fontWeight: 700 }}>{h.side.toUpperCase()}</span> ${h.size} — {bet ? bet.q : ""}</div>; })}
      </div>)}
      <div style={{ borderTop: "1px solid " + C.b, paddingTop: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: optimResult.config.length === 0 ? C.a : hasFunding && netYieldAPR > 0 ? C.g : optimResult.metrics.worstImprove > 0 && optimResult.metrics.cost < collateral * 0.15 ? C.g : optimResult.metrics.worstImprove > 0 ? C.o : C.r }}>
          {optimResult.config.length === 0
            ? "RECOMMENDATION: No hedge needed \u2014 the unhedged position has the best risk-adjusted profile."
            : hasFunding && netYieldAPR > 0.1
              ? "FUNDING HARVEST \u2014 Net yield " + (netYieldAPR * 100).toFixed(1) + "% APR after hedge cost of $" + optimResult.metrics.cost + ". Worst case: $" + optimResult.metrics.worst + ". Funding income: $" + optimResult.metrics.fundingPL + " over holding period."
              : optimResult.metrics.worstImprove > 0 && optimResult.metrics.cost < collateral * 0.15
                ? "HEDGE IS WORTH IT \u2014 Worst case improved by $" + optimResult.metrics.worstImprove + " for only $" + optimResult.metrics.cost + " in premiums (" + (optimResult.metrics.cost / collateral * 100).toFixed(1) + "% of collateral)." + (hasFunding ? " Funding: $" + optimResult.metrics.fundingPL : "")
                : optimResult.metrics.worstImprove > 0
                  ? "HEDGE HELPS but costs " + (optimResult.metrics.cost / collateral * 100).toFixed(1) + "% of collateral. Worst case improves by $" + optimResult.metrics.worstImprove + ". Consider if the protection justifies the premium."
                  : "HEDGE NOT RECOMMENDED \u2014 Avg P/L drops by $" + Math.abs(optimResult.metrics.meanChange) + " and costs $" + optimResult.metrics.cost + ". Unhedged may be better here."
          }
        </div>
      </div>
    </div>
  );
}
