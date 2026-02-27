"use client";
import InfoTip from "./InfoTip";
import { C } from "../utils/constants";

interface MetricCardProps {
  label: string;
  value: string;
  color: string;
  icon: string;
  tip: string;
}

export default function MetricCard({ label, value, color, icon, tip }: MetricCardProps) {
  return (
    <InfoTip text={tip} pos="bottom">
      <div style={{ background: C.sL, border: "1px solid " + C.b, borderRadius: 9, padding: "10px 12px", minWidth: 115, cursor: "help" }}>
        <div style={{ fontSize: 9, color: C.txD, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 4 }}>{icon} {label}</div>
        <div style={{ fontSize: 16, color: color, fontFamily: "monospace", fontWeight: 700 }}>{value}</div>
      </div>
    </InfoTip>
  );
}
