"use client";
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine
} from "recharts";
import HelpDot from "./HelpDot";
import { C } from "../utils/constants";
import type { Correlation } from "../types";

interface CorrelationChartProps {
  correlations: Correlation[];
}

export default function CorrelationChart({ correlations }: CorrelationChartProps) {
  var corrData = correlations.map(function(c) {
    return { name: c.question.length > 28 ? c.question.slice(0, 25) + "..." : c.question, corr: c.correlation };
  });

  return (
    <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600 }}>7-Day Correlation</span>
        <HelpDot text="Pearson \u03C1: +1 = move together, -1 = move opposite (ideal for hedging!), 0 = uncorrelated. Negative \u03C1 bets are best hedges \u2014 they gain when your perp loses." pos="bottom" />
      </div>
      <ResponsiveContainer width="100%" height={Math.max(80, corrData.length * 38)}>
        <BarChart data={corrData} layout="vertical" margin={{ top: 0, right: 15, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.b} />
          <XAxis type="number" domain={[-1, 1]} tick={{ fontSize: 11, fill: C.tx }} stroke={C.b} />
          <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: C.tx }} stroke={C.b} width={130} />
          <Tooltip formatter={function(v: any) { return [v.toFixed(3), "\u03C1"]; }} contentStyle={{ background: C.s, border: "1px solid " + C.bL, borderRadius: 6, fontSize: 11, fontFamily: "monospace" }} />
          <ReferenceLine x={0} stroke={C.txD} />
          <Bar dataKey="corr" radius={[0, 4, 4, 0]}>{corrData.map(function(d, i) { return <Cell key={i} fill={d.corr > 0.2 ? C.g : d.corr < -0.2 ? C.r : C.txD} fillOpacity={0.75} />; })}</Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
