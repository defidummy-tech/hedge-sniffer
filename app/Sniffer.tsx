import { useState, useMemo, useCallback, useEffect } from "react";

// ── Types ──
import type { Hedge, Direction, VarPeriod } from "./types";

// ── Utils & Constants ──
import { C } from "./utils/constants";
import { compCorr } from "./utils/math";

// ── Hooks ──
import { useAssets } from "./hooks/useAssets";
import { useLiqPrice, usePriceVariance, useScenarios, useRiskMetrics } from "./hooks/useScenarios";
import { useOptimizer } from "./hooks/useOptimizer";

// ── Components ──
import InfoTip from "./components/InfoTip";
import HelpDot from "./components/HelpDot";
import MySlider from "./components/MySlider";
import Toggle from "./components/Toggle";
import MetricCard from "./components/MetricCard";
import Surface3D from "./components/Surface3D";
import Splash from "./components/Splash";
import Header from "./components/Header";
import AssetDropdown from "./components/AssetDropdown";
import HedgesPanel from "./components/HedgesPanel";
import OptimizerResult from "./components/OptimizerResult";
import PLChart from "./components/PLChart";
import HistoryChart from "./components/HistoryChart";
import CorrelationChart from "./components/CorrelationChart";
import ScenariosTable from "./components/ScenariosTable";

/* ═══════════ MAIN APP ═══════════ */
export default function App() {
  // ── Core state ──
  var { assets, isLive, loading, error, refresh } = useAssets();
  var [selIdx, setSelIdx] = useState(0);
  var [showSplash, setShowSplash] = useState(true);
  var asset = assets[selIdx >= assets.length ? 0 : selIdx];

  // ── Position state ──
  var [dir, setDir] = useState<Direction>("long");
  var [collateral, setCollateral] = useState(1000);
  var [leverage, setLeverage] = useState(3);
  var [entryPrice, setEntryPrice] = useState(asset.pr);
  var [minVal, setMinVal] = useState(0);
  var [maxVal, setMaxVal] = useState(+(asset.pr * 2.5).toFixed(4));
  var [hedges, setHedges] = useState<Hedge[]>([]);
  var [varPeriod, setVarPeriod] = useState<VarPeriod>("7d");

  // ── Derived computations (hooks) ──
  var liqPrice = useLiqPrice(entryPrice, leverage, dir);
  var priceVar = usePriceVariance(asset, varPeriod);
  var scenarios = useScenarios(collateral, leverage, entryPrice, minVal, maxVal, dir, hedges, asset, liqPrice, priceVar);
  var risk = useRiskMetrics(scenarios, collateral, leverage, entryPrice, dir, hedges, liqPrice);
  var correlations = useMemo(function() { return compCorr(asset); }, [asset]);
  var optimizer = useOptimizer(asset, collateral, leverage, entryPrice, minVal, maxVal, dir, setHedges);

  // ── Reset on asset change ──
  useEffect(function() {
    var a = assets[selIdx];
    setEntryPrice(a.pr); setMinVal(0); setMaxVal(+(a.pr * 2.5).toFixed(4));
    setHedges([]); optimizer.setOptimResult(null);
  }, [selIdx, assets]);

  // ── Hedge management ──
  var addHedge = function(id: string) { if (!hedges.find(function(h) { return h.betId === id; })) setHedges(function(p) { return p.concat([{ betId: id, side: "no", size: 50 }]); }); };
  var rmHedge = function(id: string) { setHedges(function(p) { return p.filter(function(h) { return h.betId !== id; }); }); };
  var updHedge = function(id: string, f: string, v: any) { setHedges(function(p) { return p.map(function(h) { if (h.betId === id) { var n: any = {}; for (var k in h) n[k] = (h as any)[k]; n[f] = v; return n; } return h; }); }); };

  // ── CSV export ──
  var dlCSV = useCallback(function() {
    var b = new Blob(["Valuation,PerpPL,HedgePL,NetPL\n" + scenarios.map(function(s) { return s.valuation + "," + s.perpPL + "," + s.hedgePL + "," + s.netPL; }).join("\n")], { type: "text/csv" });
    var u = URL.createObjectURL(b); var a = document.createElement("a"); a.href = u; a.download = "trade_scenarios.csv"; a.click(); URL.revokeObjectURL(u);
  }, [scenarios]);

  var pStep = Math.max(0.001, +(asset.pr * 0.01).toFixed(4));

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.tx, fontFamily: "monospace" }}>
      <style>{
        "@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&display=swap');" +
        "*{box-sizing:border-box}" +
        "input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;background:" + C.a + ";border:2px solid " + C.bg + ";cursor:pointer;margin-top:-3px}" +
        "input[type=range]::-webkit-slider-runnable-track{height:4px;background:transparent}" +
        "input[type=range]::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:" + C.a + ";border:2px solid " + C.bg + ";cursor:pointer}" +
        ".recharts-brush-slide{fill:" + C.a + "10}"
      }</style>

      {showSplash && <Splash onClose={function() { setShowSplash(false); }} />}

      <Header onShowGuide={function() { setShowSplash(true); }} isLive={isLive} loading={loading} error={error} onRefresh={refresh} />

      <AssetDropdown assets={assets} selIdx={selIdx} onSelect={setSelIdx} />

      {/* MAIN GRID */}
      <div style={{ padding: "12px 24px", display: "grid", gridTemplateColumns: "310px 1fr", gap: 14, alignItems: "start" }}>
        {/* ═══ LEFT PANEL ═══ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Position Controls */}
          <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", fontSize: 10, color: C.tx, textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>Position<HelpDot text="Configure your perp. Long = profit when price rises. Short = profit when price falls. Leverage multiplies both gains and losses." /></div>
            <Toggle options={[{ value: "long", label: "LONG", icon: "\u2197" }, { value: "short", label: "SHORT", icon: "\u2198" }]} value={dir} onChange={setDir} colors={{ long: C.g, short: C.r }} tip="Long profits when price rises. Short profits when price drops." />
            <div style={{ height: 8 }} />
            <MySlider label="Collateral" value={collateral} onChange={setCollateral} min={100} max={10000} step={100} unit="$" tip="Capital you put up. Max perp loss = collateral \u00D7 leverage." />
            <MySlider label="Leverage" value={leverage} onChange={setLeverage} min={1} max={20} step={1} unit="x" tip="Multiplier. 3x on $1000 = $3000 notional exposure." />
            <MySlider label="Entry" value={entryPrice} onChange={setEntryPrice} min={+(asset.pr * 0.3).toFixed(4)} max={+(asset.pr * 3).toFixed(4)} step={pStep} unit="" tip={"Entry price for " + asset.sym + ". Current market: $" + asset.pr} />
            <MySlider label="Min Price Range" value={minVal} onChange={setMinVal} min={0} max={entryPrice} step={pStep} unit="" tip="Lowest simulated price. Set to 0 to see full downside scenarios." />
            <MySlider label="Max Price Range" value={maxVal} onChange={setMaxVal} min={entryPrice} max={+(asset.pr * 5).toFixed(4)} step={pStep} unit="" tip="Highest simulated price. Wider range = more comprehensive view." />
          </div>

          <HedgesPanel asset={asset} hedges={hedges} correlations={correlations} addHedge={addHedge} rmHedge={rmHedge} updHedge={updHedge} />

          {/* Actions */}
          <div style={{ display: "flex", gap: 6 }}>
            <InfoTip text="Tests thousands of hedge combos. Scores each by: avg P/L \u00D7 1.0 + worst case \u00D7 0.8 + best case \u00D7 0.15 \u2212 hedge cost \u00D7 0.05. Applies the best combo and gives a detailed trade recommendation." pos="right">
              <button onClick={optimizer.runOpt} disabled={optimizer.optimizing} style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid " + C.y + "50", background: "linear-gradient(135deg," + C.y + "15," + C.o + "10)", color: C.y, fontFamily: "monospace", fontSize: 12, fontWeight: 700, cursor: optimizer.optimizing ? "wait" : "pointer" }}>{optimizer.optimizing ? "\u27F3 ..." : "OPTIMIZE"}</button>
            </InfoTip>
            <InfoTip text="Download all scenarios as CSV." pos="left">
              <button onClick={dlCSV} style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid " + C.a + "40", background: C.a + "10", color: C.a, fontFamily: "monospace", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>\u2193 CSV</button>
            </InfoTip>
          </div>

          {optimizer.optimResult && <OptimizerResult optimResult={optimizer.optimResult} asset={asset} collateral={collateral} />}
        </div>

        {/* ═══ RIGHT PANEL ═══ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Position Strip */}
          <InfoTip text="Current position summary at a glance." pos="bottom">
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", borderRadius: 8, background: C.sL, border: "1px solid " + C.b, fontSize: 11, flexWrap: "wrap", cursor: "help" }}>
              <span style={{ color: dir === "long" ? C.g : C.r, fontWeight: 700 }}>{dir === "long" ? "\u2197 LONG" : "\u2198 SHORT"} {asset.sym}</span>
              <span style={{ color: C.txD }}>\u00B7</span><span style={{ color: C.tx }}>{leverage}x @ ${entryPrice}</span>
              <span style={{ color: C.txD }}>\u00B7</span><span style={{ color: C.tx }}>Notional: ${(collateral * leverage).toLocaleString()}</span>
              <span style={{ color: C.txD }}>\u00B7</span><span style={{ color: C.tx }}>Hedges: {hedges.length} (${hedges.reduce(function(s, h) { return s + h.size; }, 0)})</span>
              <span style={{ color: C.txD }}>\u00B7</span><span style={{ color: "#ff6090" }}>Liq: ${liqPrice}</span>
            </div>
          </InfoTip>

          {/* Metric Cards */}
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            <MetricCard label="Breakeven" value={"$" + risk.breakeven} color={C.g} icon="\u25CE" tip="Price where net P/L = $0 after hedge premiums." />
            <MetricCard label="Liquidation" value={"$" + liqPrice} color="#ff6090" icon="\u26A0" tip={"At " + leverage + "x leverage, your position gets liquidated at $" + liqPrice + ". You lose your entire $" + collateral + " collateral. Hedges still pay out after liquidation."} />
            <MetricCard label="Worst" value={"$" + risk.worst.toLocaleString()} color={C.r} icon="\u25BC" tip="Max downside across all simulated scenarios (capped at -$collateral for perp due to liquidation)." />
            <MetricCard label="Best" value={"$" + risk.best.toLocaleString()} color={C.g} icon="\u25B2" tip="Max upside across all simulated scenarios." />
            <MetricCard label="Avg P/L" value={"$" + risk.mean} color={risk.mean >= 0 ? C.g : C.r} icon="\u03BC" tip="Average P/L across all scenarios." />
            <MetricCard label="Vol" value={"$" + risk.vol} color={C.o} icon="\u03C3" tip="Standard deviation \u2014 higher = more unpredictable." />
          </div>

          <PLChart scenarios={scenarios} entryPrice={entryPrice} liqPrice={liqPrice} collateral={collateral} priceVar={priceVar} varPeriod={varPeriod} setVarPeriod={setVarPeriod} />

          {/* 3D Surface */}
          <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}><span style={{ fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600 }}>3D P/L Surface</span><HelpDot text="3D surface: Net P/L across Price (X) \u00D7 Leverage (Z). Green peaks = profit, red valleys = loss. Drag horizontally to rotate (yaw), vertically to tilt (pitch). Values shown on all three axes." pos="bottom" /></div>
            <div style={{ fontSize: 10, color: C.txM, marginBottom: 8 }}><span style={{ color: C.a }}>X: Price</span> \u00B7 <span style={{ color: C.p }}>Z: Leverage</span> \u00B7 <span style={{ color: C.g }}>Y: Net P/L</span> \u00B7 Drag to rotate on all axes</div>
            <Surface3D scenarios={scenarios} leverage={leverage} collateral={collateral} entryPrice={entryPrice} dir={dir} hedges={hedges} asset={asset} />
          </div>

          <HistoryChart asset={asset} />
          <CorrelationChart correlations={correlations} />
          <ScenariosTable scenarios={scenarios} />

          <div style={{ textAlign: "center", fontSize: 9, color: C.txM, padding: "6px 0" }}>DefiDummy's Hedge Deal Sniffer v5.0 · Real Polymarket bet titles, simulated odds/history · Not financial advice</div>
        </div>
      </div>
    </div>
  );
}
