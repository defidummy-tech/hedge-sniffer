"use client";
import InfoTip from "./InfoTip";
import { C, MASCOT } from "../utils/constants";

interface HeaderProps {
  onShowGuide: () => void;
  isLive: boolean;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export default function Header({ onShowGuide, isLive, loading, error, onRefresh }: HeaderProps) {
  var dotColor = isLive ? C.g : C.o;
  var statusText = isLive ? "LIVE" : "SIMULATED";
  var statusTip = isLive
    ? "Connected to Hyperliquid + Polymarket APIs. Prices and odds are live. Refreshes every 5 minutes."
    : (error || "Using simulated data. Live APIs not connected.");

  return (
    <div style={{ background: "linear-gradient(180deg," + C.sL + "," + C.bg + ")", borderBottom: "1px solid " + C.b, padding: "14px 24px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <img src={MASCOT} alt="" style={{ width: 34, height: 34, borderRadius: "50%", border: "2px solid " + C.a + "40" }} />
        <h1 style={{ margin: 0, fontSize: 17, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700 }}>DefiDummy's <span style={{ color: C.a }}>Hedge Deal</span> Sniffer</h1>
        <span style={{ fontSize: 9, color: C.y, background: C.y + "12", padding: "2px 7px", borderRadius: 4, fontWeight: 700 }}>v5.0</span>

        <InfoTip text={statusTip} pos="bottom">
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 5, border: "1px solid " + dotColor + "40", background: dotColor + "10", cursor: "help" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, display: "inline-block", animation: loading ? "pulse 1.5s infinite" : "none" }} />
            <span style={{ fontSize: 9, color: dotColor, fontWeight: 700, fontFamily: "monospace" }}>
              {loading ? "LOADING" : statusText}
            </span>
          </div>
        </InfoTip>

        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <InfoTip text="Refresh live data from APIs" pos="bottom">
            <button onClick={onRefresh} disabled={loading} style={{ padding: "4px 10px", borderRadius: 5, border: "1px solid " + C.a + "40", background: C.a + "10", color: C.a, fontSize: 10, cursor: loading ? "wait" : "pointer", fontFamily: "monospace", fontWeight: 600 }}>
              {loading ? "\u27F3" : "\u21BB"} Refresh
            </button>
          </InfoTip>
          <InfoTip text="Reopen the welcome guide" pos="bottom">
            <button onClick={onShowGuide} style={{ padding: "4px 10px", borderRadius: 5, border: "1px solid " + C.b, background: C.sL, color: C.txM, fontSize: 10, cursor: "pointer", fontFamily: "monospace" }}>
              Guide
            </button>
          </InfoTip>
        </div>
      </div>
      <style>{
        "@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}"
      }</style>
    </div>
  );
}
