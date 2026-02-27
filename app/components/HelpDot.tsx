"use client";
import InfoTip from "./InfoTip";
import { C } from "../utils/constants";

export default function HelpDot({ text, pos }: { text: string; pos?: "top" | "right" | "bottom" | "left" }) {
  return (
    <InfoTip text={text} pos={pos || "right"}>
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, borderRadius: "50%", background: C.a + "18", color: C.a, fontSize: 8, fontWeight: 700, cursor: "help", marginLeft: 4, flexShrink: 0 }}>?</span>
    </InfoTip>
  );
}
