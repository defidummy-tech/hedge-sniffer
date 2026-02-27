"use client";
import { useMemo } from "react";
import HelpDot from "./HelpDot";
import { C } from "../utils/constants";
import type { Scenario } from "../types";

interface ScenariosTableProps {
  scenarios: Scenario[];
}

export default function ScenariosTable({ scenarios }: ScenariosTableProps) {
  var tableRows = useMemo(function() {
    var st = Math.max(1, Math.floor(scenarios.length / 20));
    return scenarios.filter(function(_, i) { return i % st === 0 || i === scenarios.length - 1; });
  }, [scenarios]);

  return (
    <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600 }}>Scenarios</span>
        <HelpDot text="P/L at each price point. Net P/L is color-coded. Export CSV for full 100-point dataset." pos="bottom" />
        <span style={{ fontSize: 9, color: C.txM, marginLeft: 4 }}>{tableRows.length} rows</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead><tr>{["Price", "Perp P/L", "Hedge P/L", "Net P/L", ""].map(function(hd) { return <th key={hd} style={{ textAlign: "right", padding: "5px 8px", borderBottom: "1px solid " + C.b, color: C.txM, fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>{hd}</th>; })}</tr></thead>
          <tbody>{tableRows.map(function(r, i) {
            return (<tr key={i} style={{ background: r.isLiq ? "rgba(255,96,144,0.06)" : "transparent" }}>
              <td style={{ textAlign: "right", padding: "3px 8px", color: C.tx }}>${r.valuation}</td>
              <td style={{ textAlign: "right", padding: "3px 8px", color: r.perpPL >= 0 ? C.g : C.r }}>{r.perpPL >= 0 ? "+" : ""}{r.perpPL.toFixed(2)}</td>
              <td style={{ textAlign: "right", padding: "3px 8px", color: r.hedgePL >= 0 ? C.g : C.r }}>{r.hedgePL >= 0 ? "+" : ""}{r.hedgePL.toFixed(2)}</td>
              <td style={{ textAlign: "right", padding: "3px 8px", fontWeight: 600, color: r.netPL >= 0 ? C.g : C.r, background: r.netPL > 0 ? "rgba(0,230,118," + Math.min(0.18, Math.abs(r.netPL) / 5000) + ")" : r.netPL < 0 ? "rgba(255,61,90," + Math.min(0.18, Math.abs(r.netPL) / 5000) + ")" : "transparent", borderRadius: 3 }}>{r.netPL >= 0 ? "+" : ""}{r.netPL.toFixed(2)}</td>
              <td style={{ textAlign: "center", padding: "3px 4px", fontSize: 9, color: "#ff6090" }}>{r.isLiq ? "LIQ" : ""}</td>
            </tr>);
          })}</tbody>
        </table>
      </div>
    </div>
  );
}
