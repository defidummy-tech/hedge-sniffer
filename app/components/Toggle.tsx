"use client";
import HelpDot from "./HelpDot";
import { C } from "../utils/constants";

interface ToggleOption {
  value: string;
  label: string;
  icon?: string;
}

interface ToggleProps {
  options: ToggleOption[];
  value: string;
  onChange: (v: any) => void;
  colors?: Record<string, string>;
  tip?: string;
}

export default function Toggle({ options, value, onChange, colors, tip }: ToggleProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{ display: "flex", flex: 1, borderRadius: 7, overflow: "hidden", border: "1px solid " + C.b }}>
        {options.map(function(o, i) {
          var on = value === o.value;
          var col = (colors && colors[o.value]) || C.a;
          return (
            <button key={o.value} onClick={function() { onChange(o.value); }} style={{ flex: 1, padding: "7px 8px", border: "none", cursor: "pointer", fontSize: 11, fontWeight: on ? 700 : 500, background: on ? col + "20" : C.sL, color: on ? col : C.txD, fontFamily: "monospace", borderRight: i < options.length - 1 ? "1px solid " + C.b : "none", boxShadow: on ? "inset 0 -2px 0 " + col : "none", transition: "all .15s" }}>
              {o.icon && <span style={{ marginRight: 3 }}>{o.icon}</span>}{o.label}
            </button>
          );
        })}
      </div>
      {tip && <HelpDot text={tip} />}
    </div>
  );
}
