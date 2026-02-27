"use client";
import { C } from "../utils/constants";

export default function ChartTip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  var d = payload[0] && payload[0].payload ? payload[0].payload : {};
  return (
    <div style={{ background: C.s, border: "1px solid " + C.bL, borderRadius: 8, padding: "8px 12px", boxShadow: "0 8px 32px rgba(0,0,0,.6)", fontFamily: "monospace", fontSize: 11, maxWidth: 280, zIndex: 999 }}>
      <div style={{ color: C.txD, marginBottom: 4 }}>Price: ${label}</div>
      {d.isLiq && <div style={{ color: "#ff6090", fontWeight: 700, marginBottom: 2 }}>⚠ LIQUIDATED</div>}
      {payload.filter(function(p: any) { return p.dataKey !== "pos" && p.dataKey !== "neg" && p.dataKey !== "varRed" && p.dataKey !== "varGreen"; }).map(function(p: any, i: number) {
        return (
          <div key={i} style={{ color: p.color || (typeof p.value === "number" && p.value >= 0 ? C.g : C.r), marginBottom: 2 }}>
            {p.name}: {typeof p.value === "number" ? (p.value >= 0 ? "+" : "") + p.value.toFixed(2) : p.value}
          </div>
        );
      })}
    </div>
  );
}
