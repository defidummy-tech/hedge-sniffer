"use client";
import InfoTip from "./InfoTip";
import HelpDot from "./HelpDot";
import Toggle from "./Toggle";
import MySlider from "./MySlider";
import { C } from "../utils/constants";
import type { Asset, Hedge, Correlation } from "../types";

interface HedgesPanelProps {
  asset: Asset;
  hedges: Hedge[];
  correlations: Correlation[];
  addHedge: (id: string) => void;
  rmHedge: (id: string) => void;
  updHedge: (id: string, field: string, value: any) => void;
}

export default function HedgesPanel({ asset, hedges, correlations, addHedge, rmHedge, updHedge }: HedgesPanelProps) {
  return (
    <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", fontSize: 10, color: C.tx, textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>
        Hedges ({hedges.length}/{asset.bets.length})
        <HelpDot text="Add Polymarket bets to hedge. Each share costs the odds price and pays $1 if correct. YES at 20¢ = 4:1 payout. NO at 80¢ = 0.25:1 payout. Cheap YES bets are powerful tail-risk hedges. Stack multiple for layered protection." />
      </div>
      {asset.bets.map(function(bet) {
        var h = hedges.find(function(x) { return x.betId === bet.id; });
        var on = !!h;
        var corr = correlations.find(function(c) { return c.betId === bet.id; });
        var cv = corr ? corr.correlation : 0;
        var cc = cv > 0.3 ? C.g : cv < -0.3 ? C.r : C.txD;
        var yesOdds = bet.currentOdds;
        var noOdds = 100 - bet.currentOdds;
        return (
          <div key={bet.id} style={{ marginBottom: 6, padding: 8, borderRadius: 7, border: "1px solid " + (on ? C.a + "40" : C.b), background: on ? C.a + "06" : C.sL }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 4 }}>
              <InfoTip text={bet.q + "\n\nYES: " + yesOdds + "\u00A2/share \u2192 win $1 \u2192 profit " + ((100 - yesOdds) / yesOdds).toFixed(2) + "x ($" + (100 * (100 - yesOdds) / yesOdds).toFixed(0) + " profit on $100 bet)\nNO: " + noOdds + "\u00A2/share \u2192 win $1 \u2192 profit " + (yesOdds / noOdds).toFixed(2) + "x ($" + (100 * yesOdds / noOdds).toFixed(0) + " profit on $100 bet)\n\nCorrelation with " + asset.sym + " price: \u03C1 = " + cv + "\n" + (cv > 0.2 ? "Positively correlated \u2014 moves with price." : cv < -0.2 ? "Negatively correlated \u2014 good inverse hedge!" : "Weakly correlated \u2014 provides diversification.")} pos="right">
                <div style={{ flex: 1, cursor: "help" }}>
                  <div style={{ fontSize: 11, color: C.tx, lineHeight: 1.3, marginBottom: 2 }}>{bet.q}</div>
                  <div style={{ display: "flex", gap: 8, fontSize: 9, color: C.txM }}>
                    <span>YES: <span style={{ color: C.g }}>{yesOdds}¢</span></span>
                    <span>NO: <span style={{ color: C.o }}>{noOdds}¢</span></span>
                    <span>ρ: <span style={{ color: cc }}>{cv > 0 ? "+" : ""}{cv}</span></span>
                  </div>
                </div>
              </InfoTip>
              <InfoTip text={on ? "Remove this hedge" : "Add this bet as a hedge"} pos="left">
                <button onClick={function() { on ? rmHedge(bet.id) : addHedge(bet.id); }} style={{ padding: "3px 8px", borderRadius: 4, fontSize: 9, fontWeight: 600, cursor: "pointer", border: "1px solid " + (on ? C.r + "50" : C.g + "50"), background: on ? C.r + "12" : C.g + "12", color: on ? C.r : C.g, fontFamily: "monospace" }}>{on ? "\u2715" : "+ ADD"}</button>
              </InfoTip>
            </div>
            {on && h && (<div style={{ marginTop: 6 }}>
              <Toggle options={[{ value: "no", label: "NO", icon: "\u2717" }, { value: "yes", label: "YES", icon: "\u2713" }]} value={h.side} onChange={function(v: any) { updHedge(bet.id, "side", v); }} colors={{ no: C.o, yes: C.g }} tip={"YES costs " + yesOdds + "\u00A2/share. $100 bet wins $" + (100 * (100 - yesOdds) / yesOdds).toFixed(0) + " profit (" + ((100 - yesOdds) / yesOdds).toFixed(1) + ":1). NO costs " + noOdds + "\u00A2/share. $100 bet wins $" + (100 * yesOdds / noOdds).toFixed(0) + " profit (" + (yesOdds / noOdds).toFixed(1) + ":1). Cheap YES = high payout tail hedge. Cheap NO = steady income if status quo holds."} />
              <div style={{ height: 5 }} />
              <MySlider label="Size" value={h.size} onChange={function(v: number) { updHedge(bet.id, "size", v); }} min={10} max={500} step={10} unit="$" tip="Bet amount. More = more protection but more premium at risk if bet loses." />
            </div>)}
          </div>
        );
      })}
    </div>
  );
}
