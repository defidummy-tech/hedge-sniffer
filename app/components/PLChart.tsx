"use client";
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Area, ReferenceLine, ReferenceArea, CartesianGrid, Brush
} from "recharts";
import HelpDot from "./HelpDot";
import ChartTip from "./ChartTip";
import { C, VAR_PERIODS } from "../utils/constants";
import type { Scenario, PriceVariance, VarPeriod, ProfitZone } from "../types";

interface PLChartProps {
  scenarios: Scenario[];
  entryPrice: number;
  liqPrice: number;
  collateral: number;
  priceVar: PriceVariance;
  varPeriod: VarPeriod;
  setVarPeriod: (v: VarPeriod) => void;
  profitZone: ProfitZone | null;
  hasFunding: boolean;
}

export default function PLChart({ scenarios, entryPrice, liqPrice, collateral, priceVar, varPeriod, setVarPeriod, profitZone, hasFunding }: PLChartProps) {
  return (
    <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600 }}>P/L Zones + Components + Price Variance</span>
          <HelpDot text={"Combined chart showing: Green/red fill = profit/loss zones. Cyan line = total net P/L" + (hasFunding ? " (incl. funding)" : "") + ". Purple dashed = perp P/L. Orange dashed = hedge P/L. The shaded vertical band shows the historical price range over your selected time period." + (profitZone ? " Green highlighted zone = profit either way!" : "")} pos="bottom" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 10, color: C.txM }}>Price Variance:</span>
          <select value={varPeriod} onChange={function(e: any) { setVarPeriod(e.target.value); }} style={{ background: C.sL, color: C.a, border: "1px solid " + C.b, borderRadius: 5, padding: "3px 8px", fontSize: 11, fontFamily: "monospace", cursor: "pointer" }}>
            {VAR_PERIODS.map(function(vp) { return <option key={vp.v} value={vp.v}>{vp.l}</option>; })}
          </select>
          <HelpDot text="Select the lookback period for price variance. The colored band on the chart shows the min-max price range during this period. Longer periods = wider expected price ranges." pos="left" />
        </div>
      </div>
      <div style={{ fontSize: 10, color: C.txM, marginBottom: 8 }}>
        <span style={{ color: C.a }}>{"\u2014"} {hasFunding ? "Total Net P/L" : "Net P/L"}</span> · <span style={{ color: C.p }}>--- Perp</span> · <span style={{ color: C.o }}>--- Hedge</span>{hasFunding && <span> · <span style={{ color: C.y }}>--- Net (no funding)</span></span>} · <span style={{ color: C.r }}>{"\u25AE"}</span> {varPeriod} downside · <span style={{ color: C.g }}>{"\u25AE"}</span> {varPeriod} upside · <span style={{ color: "#ff6090" }}>Liq ${liqPrice}</span>{profitZone && <span> · <span style={{ color: C.g, fontWeight: 700 }}>{"\u2588"} Profit Zone</span></span>}
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={scenarios} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
          <defs>
            <linearGradient id="gG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.g} stopOpacity={0.35} /><stop offset="100%" stopColor={C.g} stopOpacity={0.02} /></linearGradient>
            <linearGradient id="rG" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor={C.r} stopOpacity={0.35} /><stop offset="100%" stopColor={C.r} stopOpacity={0.02} /></linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={C.b} />
          <XAxis dataKey="valuation" type="number" tick={{ fontSize: 11, fill: C.tx }} stroke={C.b} domain={["dataMin", "dataMax"]} tickCount={9} />
          <YAxis tick={{ fontSize: 11, fill: C.tx }} stroke={C.b} />
          <Tooltip content={<ChartTip />} />
          <ReferenceLine y={0} stroke={C.txD} strokeDasharray="4 4" strokeOpacity={0.5} />
          <ReferenceLine x={entryPrice} stroke={C.a} strokeWidth={1.5} strokeDasharray="4 4" strokeOpacity={0.8} label={{ value: "Entry", position: "top", fill: C.a, fontSize: 10, fontWeight: 700 }} />
          <ReferenceLine x={liqPrice} stroke="#ff6090" strokeWidth={2} strokeDasharray="8 4" strokeOpacity={0.9} label={{ value: "LIQ", position: "insideTopRight", fill: "#ff6090", fontSize: 10, fontWeight: 700 }} />
          <ReferenceLine x={priceVar.low} stroke={C.r} strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.6} label={{ value: varPeriod + " Lo", position: "insideBottomLeft", fill: C.r, fontSize: 9 }} />
          <ReferenceLine x={priceVar.high} stroke={C.g} strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.6} label={{ value: varPeriod + " Hi", position: "insideBottomRight", fill: C.g, fontSize: 9 }} />
          {profitZone && (
            <ReferenceArea x1={profitZone.lowPrice} x2={profitZone.highPrice} fill={C.g} fillOpacity={0.08} stroke={C.g} strokeOpacity={0.3} strokeDasharray="4 4" label={{ value: "\u2713 Profit Zone", position: "insideTop", fill: C.g, fontSize: 10, fontWeight: 700 }} />
          )}
          <Area type="monotone" dataKey="varRed" stroke="none" fill={C.r} fillOpacity={0.12} connectNulls={false} name="Downside Range" isAnimationActive={false} />
          <Area type="monotone" dataKey="varGreen" stroke="none" fill={C.g} fillOpacity={0.12} connectNulls={false} name="Upside Range" isAnimationActive={false} />
          <Area type="monotone" dataKey="pos" stroke="none" fill="url(#gG)" name="Profit Zone" />
          <Area type="monotone" dataKey="neg" stroke="none" fill="url(#rG)" name="Loss Zone" />
          <Line type="monotone" dataKey="perpPL" name="Perp P/L" stroke={C.p} strokeWidth={2} dot={false} strokeDasharray="6 3" />
          <Line type="monotone" dataKey="hedgePL" name="Hedge P/L" stroke={C.o} strokeWidth={2} dot={false} strokeDasharray="6 3" />
          {hasFunding && <Line type="monotone" dataKey="netPL" name="Net (no funding)" stroke={C.y} strokeWidth={1.5} dot={false} strokeDasharray="4 3" strokeOpacity={0.5} />}
          <Line type="monotone" dataKey="totalNetPL" name={hasFunding ? "Total Net P/L" : "Net P/L"} stroke={C.a} strokeWidth={2.5} dot={false} />
          <ReferenceLine y={-collateral} stroke="#ff6090" strokeWidth={1} strokeDasharray="4 4" strokeOpacity={0.4} label={{ value: "Max Loss -$" + collateral, position: "left", fill: "#ff6090", fontSize: 9 }} />
          <Brush dataKey="valuation" height={20} stroke={C.bL} fill={C.sL} />
        </ComposedChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 6, fontSize: 10, color: C.txM, flexWrap: "wrap" }}>
        <span>{varPeriod} Low: <span style={{ color: C.r, fontWeight: 600 }}>${priceVar.low.toFixed(2)}</span></span>
        <span>{varPeriod} High: <span style={{ color: C.g, fontWeight: 600 }}>${priceVar.high.toFixed(2)}</span></span>
        <span>Range: <span style={{ color: C.a, fontWeight: 600 }}>${(priceVar.high - priceVar.low).toFixed(2)}</span></span>
      </div>
      {profitZone && (
        <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 6, background: C.g + "10", border: "1px solid " + C.g + "30", fontSize: 11 }}>
          <span style={{ color: C.g, fontWeight: 700 }}>{"\u2713"} Profit Either Way</span>
          <span style={{ color: C.txM }}> from </span>
          <span style={{ color: C.tx, fontWeight: 600 }}>${profitZone.lowPrice}</span>
          <span style={{ color: C.txM }}> to </span>
          <span style={{ color: C.tx, fontWeight: 600 }}>${profitZone.highPrice}</span>
          <span style={{ color: C.txM }}> ({(profitZone.widthPct * 100).toFixed(1)}% range)</span>
          <span style={{ color: C.txM }}> · Min profit: </span>
          <span style={{ color: C.g, fontWeight: 600 }}>${profitZone.minProfit}</span>
          {profitZone.varianceCoverage > 0 && (
            <span style={{ color: C.txM }}> · Covers {(profitZone.varianceCoverage * 100).toFixed(0)}% of {"\u00B1"} variance</span>
          )}
        </div>
      )}
    </div>
  );
}
