"use client";
import InfoTip from "./InfoTip";
import { C, MASCOT } from "../utils/constants";

interface HeaderProps {
  onShowGuide: () => void;
}

export default function Header({ onShowGuide }: HeaderProps) {
  return (
    <div style={{ background: "linear-gradient(180deg," + C.sL + "," + C.bg + ")", borderBottom: "1px solid " + C.b, padding: "14px 24px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <img src={MASCOT} alt="" style={{ width: 34, height: 34, borderRadius: "50%", border: "2px solid " + C.a + "40" }} />
        <h1 style={{ margin: 0, fontSize: 17, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700 }}>DefiDummy's <span style={{ color: C.a }}>Hedge Deal</span> Sniffer</h1>
        <span style={{ fontSize: 9, color: C.y, background: C.y + "12", padding: "2px 7px", borderRadius: 4, fontWeight: 700 }}>v5.0</span>
        <div style={{ marginLeft: "auto" }}>
          <InfoTip text="Reopen the welcome guide" pos="bottom">
            <button onClick={onShowGuide} style={{ padding: "4px 10px", borderRadius: 5, border: "1px solid " + C.b, background: C.sL, color: C.txM, fontSize: 10, cursor: "pointer", fontFamily: "monospace" }}>
              Guide
            </button>
          </InfoTip>
        </div>
      </div>
    </div>
  );
}
