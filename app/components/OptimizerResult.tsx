"use client";
import HelpDot from "./HelpDot";
import { C } from "../utils/constants";
import type { Asset, OptimResult } from "../types";

interface OptimizerResultProps {
  optimResult: OptimResult;
  asset: Asset;
  collateral: number;
}

export default function OptimizerResult({ optimResult, asset, collateral }: OptimizerResultProps) {
  return (
    <div style={{ padding: "10px 12px", borderRadius: 8, background: C.sL, border: "1px solid " + C.y + "30", fontSize: 10 }}>
      <div style={{ color: C.y, fontWeight: 700, fontSize: 12, marginBottom: 6 }}>OPTIMIZATION RESULT</div>
      <div style={{ color: C.tx, marginBottom: 4 }}>
        <strong>Composite Score: {optimResult.score}</strong>
        <HelpDot text={"Score = (Avg P/L \u00D7 1.0) + (Worst Case \u00D7 0.8) + (Best Case \u00D7 0.15) \u2212 (Hedge Cost \u00D7 0.05)\n\n= (" + optimResult.metrics.mean + " \u00D7 1.0) + (" + optimResult.metrics.worst + " \u00D7 0.8) + (" + optimResult.metrics.best + " \u00D7 0.15) \u2212 (" + optimResult.metrics.cost + " \u00D7 0.05)\n\nThis score balances average profitability, downside protection, upside potential, and hedge cost."} pos="right" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 6, fontSize: 10 }}>
        <div style={{ color: C.txM }}>Avg P/L: <span style={{ color: optimResult.metrics.mean >= 0 ? C.g : C.r, fontWeight: 600 }}>${optimResult.metrics.mean}</span></div>
        <div style={{ color: C.txM }}>Worst: <span style={{ color: C.r, fontWeight: 600 }}>${optimResult.metrics.worst}</span></div>
        <div style={{ color: C.txM }}>Best: <span style={{ color: C.g, fontWeight: 600 }}>${optimResult.metrics.best}</span></div>
        <div style={{ color: C.txM }}>Hedge Cost: <span style={{ color: C.o, fontWeight: 600 }}>${optimResult.metrics.cost}</span></div>
      </div>
      <div style={{ borderTop: "1px solid " + C.b, paddingTop: 6, marginBottom: 4 }}>
        <div style={{ fontSize: 10, color: C.txM }}>vs. No Hedge: Worst case <span style={{ color: optimResult.metrics.worstImprove > 0 ? C.g : C.r, fontWeight: 600 }}>{optimResult.metrics.worstImprove > 0 ? "+" : ""}{optimResult.metrics.worstImprove}</span> · Avg P/L <span style={{ color: optimResult.metrics.meanChange > 0 ? C.g : C.r, fontWeight: 600 }}>{optimResult.metrics.meanChange > 0 ? "+" : ""}{optimResult.metrics.meanChange}</span></div>
      </div>
      {optimResult.config.length > 0 && (<div style={{ marginBottom: 4 }}>
        {optimResult.config.map(function(h) { var bet = asset.bets.find(function(b) { return b.id === h.betId; }); return <div key={h.betId} style={{ color: C.tx, fontSize: 10 }}><span style={{ color: h.side === "no" ? C.o : C.g, fontWeight: 700 }}>{h.side.toUpperCase()}</span> ${h.size} — {bet ? bet.q : ""}</div>; })}
      </div>)}
      <div style={{ borderTop: "1px solid " + C.b, paddingTop: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: optimResult.metrics.worstImprove > 0 && optimResult.metrics.cost < collateral * 0.15 ? C.g : optimResult.config.length === 0 ? C.a : C.o }}>
          {optimResult.config.length === 0
            ? "RECOMMENDATION: No hedge needed \u2014 the unhedged position has the best risk-adjusted profile."
            : optimResult.metrics.worstImprove > 0 && optimResult.metrics.cost < collateral * 0.15
              ? "HEDGE IS WORTH IT \u2014 Worst case improved by $" + optimResult.metrics.worstImprove + " for only $" + optimResult.metrics.cost + " in premiums (" + (optimResult.metrics.cost / collateral * 100).toFixed(1) + "% of collateral)."
              : optimResult.metrics.worstImprove > 0
                ? "HEDGE HELPS but costs " + (optimResult.metrics.cost / collateral * 100).toFixed(1) + "% of collateral. Worst case improves by $" + optimResult.metrics.worstImprove + ". Consider if the protection justifies the premium."
                : "HEDGE NOT RECOMMENDED \u2014 Avg P/L drops by $" + Math.abs(optimResult.metrics.meanChange) + " and costs $" + optimResult.metrics.cost + ". Unhedged may be better here."
          }
        </div>
      </div>
    </div>
  );
}
