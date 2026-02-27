"use client";
import { useState } from "react";
import { C } from "../utils/constants";

type TipPos = "top" | "right" | "bottom" | "left";

const posStyles: Record<TipPos, React.CSSProperties> = {
  top: { bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" },
  right: { left: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" },
  bottom: { top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" },
  left: { right: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" },
};

export default function InfoTip({ text, children, pos }: { text: string; children: React.ReactNode; pos?: TipPos }) {
  var p = pos || "top";
  var [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }} onMouseEnter={function() { setShow(true); }} onMouseLeave={function() { setShow(false); }}>
      {children}
      {show && <div style={{ position: "absolute", ...posStyles[p], zIndex: 9999, width: 260, padding: "10px 12px", background: "#1a2540", border: "1px solid " + C.bL, borderRadius: 8, boxShadow: "0 12px 40px rgba(0,0,0,.7)", fontSize: 11, color: C.txM, lineHeight: 1.5, fontFamily: "sans-serif", pointerEvents: "none" }}>{text}</div>}
    </span>
  );
}
