"use client";
import HelpDot from "./HelpDot";
import { C } from "../utils/constants";

interface MySliderProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  tip?: string;
}

export default function MySlider({ label, value, onChange, min, max, step, unit, tip }: MySliderProps) {
  var pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <label style={{ fontSize: 11, color: C.tx, fontFamily: "monospace", letterSpacing: ".04em", textTransform: "uppercase" }}>{label}</label>
          {tip && <HelpDot text={tip} />}
        </div>
        <span style={{ fontSize: 14, color: C.a, fontFamily: "monospace", fontWeight: 700 }}>
          {unit === "$" ? "$" + value.toLocaleString() : unit === "x" ? value + "x" : "$" + value}
        </span>
      </div>
      <div style={{ position: "relative", height: 4, borderRadius: 2, background: C.b }}>
        <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: pct + "%", borderRadius: 2, background: "linear-gradient(90deg," + C.aD + "," + C.a + ")" }} />
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={function(e) { onChange(Number(e.target.value)); }} style={{ width: "100%", marginTop: -4, appearance: "none", WebkitAppearance: "none", background: "transparent", cursor: "pointer", height: 16 }} />
    </div>
  );
}
