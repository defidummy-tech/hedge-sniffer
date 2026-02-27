"use client";
import { useState } from "react";
import HelpDot from "./HelpDot";
import { C } from "../utils/constants";
import type { Asset } from "../types";

type SortMode = "name" | "funding" | "volume";

interface AssetDropdownProps {
  assets: Asset[];
  selIdx: number;
  onSelect: (idx: number) => void;
}

export default function AssetDropdown({ assets, selIdx, onSelect }: AssetDropdownProps) {
  var [dropOpen, setDropOpen] = useState(false);
  var [sortBy, setSortBy] = useState<SortMode>("name");
  var asset = assets[selIdx];

  // Create sorted index array
  var sortedIndices: number[] = [];
  for (var i = 0; i < assets.length; i++) sortedIndices.push(i);
  if (sortBy === "funding") {
    sortedIndices.sort(function(a, b) { return Math.abs(assets[b].fundingRateAPR || 0) - Math.abs(assets[a].fundingRateAPR || 0); });
  } else if (sortBy === "volume") {
    sortedIndices.sort(function(a, b) { return (assets[b].dayNtlVlm || 0) - (assets[a].dayNtlVlm || 0); });
  }

  var fundingAPR = asset.fundingRateAPR || 0;
  var fundingColor = fundingAPR > 0 ? C.g : fundingAPR < 0 ? C.r : C.txD;

  return (
    <div style={{ padding: "10px 24px 0", position: "relative", zIndex: 100 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 10, color: C.tx, textTransform: "uppercase", fontWeight: 600 }}>Asset:</span>
        <HelpDot text="Select a Hyperliquid perpetual futures asset. Each is paired with real active Polymarket prediction bets for hedging simulation." />
        <div style={{ position: "relative" }}>
          <button onClick={function() { setDropOpen(function(o) { return !o; }); }} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid " + C.a + "50", background: C.a + "10", color: C.a, fontFamily: "monospace", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, minWidth: 220 }}>
            <span>{asset.sym}</span>
            <span style={{ color: C.txM, fontWeight: 500, fontSize: 11 }}>{asset.name}</span>
            <span style={{ color: C.tx, fontSize: 11 }}>${asset.pr}</span>
            {fundingAPR !== 0 && (
              <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: fundingColor + "18", color: fundingColor, fontWeight: 700 }}>
                {(fundingAPR * 100).toFixed(0)}% APR
              </span>
            )}
            <span style={{ marginLeft: "auto", fontSize: 9 }}>{dropOpen ? "\u25B2" : "\u25BC"}</span>
          </button>
          {dropOpen && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, width: 420, maxHeight: 420, overflowY: "auto", background: C.s, border: "1px solid " + C.bL, borderRadius: 10, boxShadow: "0 16px 48px rgba(0,0,0,.7)", zIndex: 200 }}>
              <div style={{ padding: "8px 12px 4px", fontSize: 9, color: C.txM, textTransform: "uppercase", borderBottom: "1px solid " + C.b, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>Hyperliquid Perps ({assets.length})</span>
                <div style={{ display: "flex", gap: 4 }}>
                  <span style={{ fontSize: 8, color: C.txD }}>Sort:</span>
                  {(["name", "funding", "volume"] as SortMode[]).map(function(s) {
                    return (
                      <button key={s} onClick={function(e) { e.stopPropagation(); setSortBy(s); }} style={{
                        padding: "1px 6px", borderRadius: 3, border: "1px solid " + (sortBy === s ? C.a + "50" : C.b),
                        background: sortBy === s ? C.a + "15" : "transparent", color: sortBy === s ? C.a : C.txD,
                        fontSize: 8, cursor: "pointer", textTransform: "uppercase", fontWeight: 600,
                      }}>{s}</button>
                    );
                  })}
                </div>
              </div>
              {sortedIndices.map(function(idx) {
                var a = assets[idx];
                var fAPR = a.fundingRateAPR || 0;
                var fColor = fAPR > 0 ? C.g : fAPR < 0 ? C.r : C.txD;
                var vol24h = a.dayNtlVlm || 0;
                return (
                  <button key={a.sym} onClick={function() { onSelect(idx); setDropOpen(false); }} style={{ display: "flex", width: "100%", padding: "9px 12px", border: "none", borderBottom: "1px solid " + C.b + "08", background: selIdx === idx ? C.a + "10" : "transparent", cursor: "pointer", alignItems: "center", gap: 10, textAlign: "left" }}>
                    <span style={{ color: selIdx === idx ? C.a : C.tx, fontFamily: "monospace", fontSize: 13, fontWeight: 700, width: 55 }}>{a.sym}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: C.tx, fontSize: 11 }}>{a.name}</div>
                      <div style={{ color: C.txM, fontSize: 9 }}>{a.cat} · {a.bets.length} bet{a.bets.length > 1 ? "s" : ""}{vol24h > 0 ? " · Vol $" + (vol24h > 1e6 ? (vol24h / 1e6).toFixed(1) + "M" : (vol24h / 1e3).toFixed(0) + "K") : ""}</div>
                    </div>
                    {fAPR !== 0 && (
                      <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: fColor + "15", color: fColor, fontWeight: 700, fontFamily: "monospace" }}>
                        {fAPR > 0 ? "+" : ""}{(fAPR * 100).toFixed(0)}%
                      </span>
                    )}
                    <span style={{ color: C.a, fontFamily: "monospace", fontSize: 12, fontWeight: 600, minWidth: 65, textAlign: "right" }}>${a.pr}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
