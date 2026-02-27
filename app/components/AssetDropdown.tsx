"use client";
import { useState } from "react";
import HelpDot from "./HelpDot";
import { C } from "../utils/constants";
import type { Asset } from "../types";

interface AssetDropdownProps {
  assets: Asset[];
  selIdx: number;
  onSelect: (idx: number) => void;
}

export default function AssetDropdown({ assets, selIdx, onSelect }: AssetDropdownProps) {
  var [dropOpen, setDropOpen] = useState(false);
  var asset = assets[selIdx];

  return (
    <div style={{ padding: "10px 24px 0", position: "relative", zIndex: 100 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 10, color: C.tx, textTransform: "uppercase", fontWeight: 600 }}>Asset:</span>
        <HelpDot text="Select a Hyperliquid perpetual futures asset. Each is paired with real active Polymarket prediction bets for hedging simulation." />
        <div style={{ position: "relative" }}>
          <button onClick={function() { setDropOpen(function(o) { return !o; }); }} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid " + C.a + "50", background: C.a + "10", color: C.a, fontFamily: "monospace", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, minWidth: 220 }}>
            <span>{asset.sym}</span><span style={{ color: C.txM, fontWeight: 500, fontSize: 11 }}>{asset.name}</span><span style={{ color: C.tx, fontSize: 11 }}>${asset.pr}</span><span style={{ marginLeft: "auto", fontSize: 9 }}>{dropOpen ? "\u25B2" : "\u25BC"}</span>
          </button>
          {dropOpen && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, width: 360, maxHeight: 380, overflowY: "auto", background: C.s, border: "1px solid " + C.bL, borderRadius: 10, boxShadow: "0 16px 48px rgba(0,0,0,.7)", zIndex: 200 }}>
              <div style={{ padding: "8px 12px 4px", fontSize: 9, color: C.txM, textTransform: "uppercase", borderBottom: "1px solid " + C.b }}>Hyperliquid Perps ({assets.length})</div>
              {assets.map(function(a, i) {
                return (<button key={a.sym} onClick={function() { onSelect(i); setDropOpen(false); }} style={{ display: "flex", width: "100%", padding: "9px 12px", border: "none", borderBottom: "1px solid " + C.b + "08", background: selIdx === i ? C.a + "10" : "transparent", cursor: "pointer", alignItems: "center", gap: 10, textAlign: "left" }}>
                  <span style={{ color: selIdx === i ? C.a : C.tx, fontFamily: "monospace", fontSize: 13, fontWeight: 700, width: 50 }}>{a.sym}</span>
                  <div style={{ flex: 1 }}><div style={{ color: C.tx, fontSize: 11 }}>{a.name}</div><div style={{ color: C.txM, fontSize: 9 }}>{a.cat} · {a.bets.length} bet{a.bets.length > 1 ? "s" : ""}</div></div>
                  <span style={{ color: C.a, fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>${a.pr}</span>
                </button>);
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
