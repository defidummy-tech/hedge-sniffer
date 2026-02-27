"use client";
import { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Brush
} from "recharts";
import HelpDot from "./HelpDot";
import ChartTip from "./ChartTip";
import { C, BET_COLORS } from "../utils/constants";
import type { Asset } from "../types";

interface HistoryChartProps {
  asset: Asset;
}

export default function HistoryChart({ asset }: HistoryChartProps) {
  var histData = useMemo(function() {
    return asset.priceHistory.filter(function(_, i) { return i % 4 === 0; }).map(function(p, idx) {
      var r: any = { t: Math.floor((idx * 4) / 24) + "d", price: p.price };
      asset.bets.forEach(function(b) { if (b.oddsHistory[idx * 4]) r[b.id] = b.oddsHistory[idx * 4].odds; });
      return r;
    });
  }, [asset]);

  return (
    <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600 }}>7-Day: {asset.sym} Price vs Bet Odds</span>
        <HelpDot text="Overlays 7-day price (left axis) with bet odds (right axis). Look for divergences \u2014 when price drops but odds rise, it may signal a hedging opportunity." pos="bottom" />
      </div>
      <ResponsiveContainer width="100%" height={210}>
        <LineChart data={histData} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.b} />
          <XAxis dataKey="t" tick={{ fontSize: 11, fill: C.tx }} stroke={C.b} interval={Math.floor(histData.length / 7)} />
          <YAxis yAxisId="p" tick={{ fontSize: 11, fill: C.tx }} stroke={C.b} domain={["auto", "auto"]} />
          <YAxis yAxisId="o" orientation="right" tick={{ fontSize: 11, fill: C.tx }} stroke={C.b} domain={[0, 100]} />
          <Tooltip content={<ChartTip />} />
          <Line yAxisId="p" type="monotone" dataKey="price" name={asset.sym + " Price"} stroke={C.a} strokeWidth={2} dot={false} />
          {asset.bets.map(function(b, i) { return <Line key={b.id} yAxisId="o" type="monotone" dataKey={b.id} name={b.q.slice(0, 28)} stroke={BET_COLORS[i]} strokeWidth={1.2} dot={false} strokeDasharray="5 3" />; })}
          <Brush dataKey="t" height={18} stroke={C.bL} fill={C.sL} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
