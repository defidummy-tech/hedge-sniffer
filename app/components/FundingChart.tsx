"use client";
import { useMemo } from "react";
import {
  ComposedChart, Bar, Line, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine
} from "recharts";
import HelpDot from "./HelpDot";
import { C } from "../utils/constants";
import type { Asset, Direction } from "../types";

interface FundingChartProps {
  asset: Asset;
  dir: Direction;
}

export default function FundingChart({ asset, dir }: FundingChartProps) {
  var data = useMemo(function() {
    var history = asset.fundingRateHistory || [];
    if (history.length === 0) return [];
    // Sample every 4 hours for readability
    var sampled = history.filter(function(_, i) { return i % 4 === 0; });
    // Compute 24h rolling average
    return sampled.map(function(pt, idx) {
      var windowStart = Math.max(0, idx - 6); // 6 samples × 4h = 24h
      var window = sampled.slice(windowStart, idx + 1);
      var avg = window.reduce(function(s, p) { return s + p.apr; }, 0) / window.length;
      var dayLabel = Math.floor(idx * 4 / 24);
      return {
        label: dayLabel + "d" + ((idx * 4) % 24) + "h",
        apr: +(pt.apr * 100).toFixed(2),
        avg: +(avg * 100).toFixed(2),
        favorable: dir === "long" ? pt.rate < 0 : pt.rate > 0,
      };
    });
  }, [asset.fundingRateHistory, dir]);

  if (data.length === 0) return null;

  var currentAPR = (asset.fundingRateAPR || 0) * 100;
  var isSpike = false;
  if (data.length > 6) {
    var recent = Math.abs(data[data.length - 1].apr);
    var avgRecent = data.slice(-6).reduce(function(s, d) { return s + Math.abs(d.avg); }, 0) / 6;
    isSpike = recent > avgRecent * 2;
  }

  return (
    <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600 }}>7-Day Funding Rate</span>
        <HelpDot text={"Funding rates over 7 days. Green bars = you earn funding in your direction. Red = you pay. Dashed line = 24h rolling average. Current: " + currentAPR.toFixed(1) + "% APR. " + (isSpike ? "SPIKE DETECTED — rate is 2x+ above average. May be temporary." : "Rate is relatively stable.")} pos="bottom" />
        <span style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 700, color: currentAPR > 0 ? C.g : currentAPR < 0 ? C.r : C.txD, marginLeft: "auto" }}>
          {currentAPR > 0 ? "+" : ""}{currentAPR.toFixed(1)}% APR
        </span>
        {isSpike && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: C.o + "20", color: C.o, fontWeight: 700 }}>SPIKE</span>}
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={data} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.b} />
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: C.txD }} stroke={C.b} interval={Math.floor(data.length / 7)} />
          <YAxis tick={{ fontSize: 9, fill: C.txD }} stroke={C.b} tickFormatter={function(v: number) { return v.toFixed(0) + "%"; }} />
          <Tooltip contentStyle={{ background: C.s, border: "1px solid " + C.bL, borderRadius: 6, fontSize: 10, fontFamily: "monospace" }} formatter={function(v: any) { return [v + "% APR"]; }} />
          <ReferenceLine y={0} stroke={C.txD} strokeDasharray="4 4" />
          <Bar dataKey="apr" radius={[2, 2, 0, 0]}>
            {data.map(function(d, i) {
              return <Cell key={i} fill={d.favorable ? C.g : C.r} fillOpacity={0.6} />;
            })}
          </Bar>
          <Line type="monotone" dataKey="avg" name="24h Avg" stroke={C.o} strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
