"use client";
import { C, MASCOT } from "../utils/constants";

export default function Splash({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(6,9,15,0.93)", backdropFilter: "blur(8px)" }}>
      <div style={{ background: C.s, border: "1px solid " + C.bL, borderRadius: 16, padding: "24px 28px", maxWidth: 540, width: "92%", boxShadow: "0 24px 80px rgba(0,0,0,.6)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <img src={MASCOT} alt="" style={{ width: 48, height: 48, borderRadius: "50%", border: "2px solid " + C.a + "40" }} />
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontFamily: "sans-serif", fontWeight: 800, color: C.tx }}>DefiDummy's <span style={{ color: C.a }}>Hedge Deal</span> Sniffer</h2>
            <div style={{ fontSize: 10, color: C.txM, marginTop: 2 }}>v5.0 · Multi-Hedge Simulator</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: C.txM, lineHeight: 1.7, marginBottom: 18 }}>
          <p style={{ margin: "0 0 10px" }}>Simulate <strong style={{ color: C.a }}>leveraged perpetual futures</strong> hedged with <strong style={{ color: C.o }}>real Polymarket prediction bets</strong>. Bet titles sourced from live Polymarket markets — odds and price history are simulated for demo purposes.</p>
          <div style={{ background: C.sL, borderRadius: 8, padding: 12, marginBottom: 10, border: "1px solid " + C.b }}>
            <div style={{ fontSize: 11, color: C.y, fontWeight: 700, marginBottom: 6 }}>🔑 KEY FEATURES</div>
            <div style={{ fontSize: 11, color: C.txM, lineHeight: 1.9 }}>
              <span style={{ color: C.g }}>◎</span> <strong>Multi-hedge</strong> — Stack Yes/No Polymarket bets per perp<br />
              <span style={{ color: C.p }}>◎</span> <strong>3D Surface</strong> — P/L across Price × Leverage (drag to rotate on all axes)<br />
              <span style={{ color: C.o }}>◎</span> <strong>Price Variance</strong> — Historical price range overlay on P/L chart<br />
              <span style={{ color: C.a }}>◎</span> <strong>Optimizer</strong> — Auto-find best hedge with detailed scoring<br />
              <span style={{ color: C.txM }}>◎</span> <strong>Tooltips</strong> — Hover <span style={{ color: C.a }}>?</span> icons for full explanations
            </div>
          </div>
          <div style={{ background: C.sL, borderRadius: 8, padding: 12, border: "1px solid " + C.b }}>
            <div style={{ fontSize: 11, color: C.a, fontWeight: 700, marginBottom: 6 }}>💡 QUICK START</div>
            <div style={{ fontSize: 11, color: C.txM, lineHeight: 1.9 }}>
              1. Pick a <strong>perp</strong> from the dropdown<br />
              2. Choose <strong>Long/Short</strong>, set position params<br />
              3. <strong>+ ADD</strong> Polymarket hedges with Yes/No and size<br />
              4. Charts update <strong>live</strong> — drag brushes to zoom<br />
              5. Hit <strong>⚡ Optimize</strong> for the best hedge combo and trade recommendation
            </div>
          </div>
        </div>
        <button onClick={onClose} style={{ width: "100%", padding: "12px 0", borderRadius: 8, border: "none", cursor: "pointer", background: "linear-gradient(135deg," + C.a + "," + C.aD + ")", color: C.bg, fontFamily: "sans-serif", fontSize: 14, fontWeight: 700 }}>LET'S SNIFF SOME DEALS →</button>
      </div>
    </div>
  );
}
