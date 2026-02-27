"use client";
import { C } from "../utils/constants";
import type { Deal } from "../types";

interface DealScannerProps {
  deals: Deal[];
  onSelectDeal: (assetIdx: number) => void;
}

var TYPE_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  funding_harvest: { label: "FUNDING", color: C.g, icon: "$" },
  directional_hedge: { label: "HEDGE", color: C.a, icon: "\u2194" },
  correlation_play: { label: "CORR", color: C.p, icon: "\u03C1" },
};

export default function DealScanner({ deals, onSelectDeal }: DealScannerProps) {
  return (
    <div style={{ padding: "16px 24px" }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 20, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700 }}>
          <span style={{ color: C.a }}>Deal</span> Scanner
        </h2>
        <div style={{ fontSize: 11, color: C.txM }}>
          {deals.length} opportunities found · Ranked by score · Click to analyze
        </div>
      </div>

      {deals.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: C.txD, fontSize: 12 }}>
          Loading deals... or no opportunities detected with current market data.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
        {deals.map(function(deal, i) {
          var typeInfo = TYPE_LABELS[deal.type] || { label: "DEAL", color: C.txM, icon: "?" };
          return (
            <button key={i} onClick={function() { onSelectDeal(deal.assetIdx); }} style={{
              display: "block", width: "100%", textAlign: "left", padding: "12px 14px",
              background: C.s, border: "1px solid " + C.b, borderRadius: 10,
              cursor: "pointer", transition: "border-color .15s",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.tx, fontFamily: "monospace" }}>{deal.sym}</span>
                <span style={{ fontSize: 10, color: C.txM }}>{deal.name}</span>
                <span style={{
                  fontSize: 8, padding: "2px 6px", borderRadius: 3, fontWeight: 700, marginLeft: "auto",
                  background: typeInfo.color + "18", color: typeInfo.color
                }}>
                  {typeInfo.icon} {typeInfo.label}
                </span>
              </div>

              <div style={{ fontSize: 11, color: C.txM, lineHeight: 1.5, marginBottom: 6 }}>{deal.description}</div>

              <div style={{ display: "flex", gap: 10, fontSize: 10, color: C.txM }}>
                {deal.fundingAPR !== 0 && (
                  <span>Funding: <span style={{ color: deal.fundingAPR > 0 ? C.g : C.r, fontWeight: 600 }}>
                    {(deal.fundingAPR * 100).toFixed(0)}% APR
                  </span></span>
                )}
                {deal.type === "funding_harvest" && deal.netYieldAPR > 0 && (
                  <span>Est. Net: <span style={{ color: C.g, fontWeight: 600 }}>
                    ~{(deal.netYieldAPR * 100).toFixed(0)}% APR
                  </span></span>
                )}
                {deal.type === "directional_hedge" && (
                  <span>Hedge: <span style={{ color: C.a, fontWeight: 600 }}>{deal.bestHedgeCost}\u00A2</span></span>
                )}
                <span style={{ marginLeft: "auto", color: C.y, fontWeight: 600 }}>Score: {deal.score}</span>
              </div>

              <div style={{ textAlign: "right", marginTop: 6 }}>
                <span style={{ fontSize: 10, color: C.a, fontWeight: 600 }}>Analyze \u2192</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
