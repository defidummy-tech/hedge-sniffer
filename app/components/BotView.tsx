"use client";
import { useState, useEffect, useCallback } from "react";
import { C } from "../utils/constants";
import type { BotConfig, BotStatus, BotTrade } from "../types";

// ── Default Config ──

var DEFAULT_CONFIG: BotConfig = {
  enabled: false,
  testnet: true,
  entryAPR: 10.0,
  exitAPR: 1.0,
  maxPositionUSD: 100,
  leverage: 3,
  maxPositions: 3,
  stopLossPct: 5,
  maxHoldHours: 168,
  fundingLockMinutes: 10,
  spotHedge: false,
  spotHedgeRatio: 1.0,
  paperTrading: false,
  paperBalance: 10000,
};

// ── Sub-Components ──

function StatusBadge(props: { config: BotConfig }) {
  var c = props.config;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{
        fontSize: 10, padding: "3px 10px", borderRadius: 4, fontWeight: 700, fontFamily: "monospace",
        background: c.enabled ? C.g + "18" : C.r + "18",
        color: c.enabled ? C.g : C.r,
        border: "1px solid " + (c.enabled ? C.g : C.r) + "40",
      }}>
        {c.enabled ? "\u25CF ACTIVE" : "\u25CB INACTIVE"}
      </span>
      <span style={{
        fontSize: 10, padding: "3px 10px", borderRadius: 4, fontWeight: 700, fontFamily: "monospace",
        background: c.testnet ? C.o + "18" : C.r + "18",
        color: c.testnet ? C.o : C.r,
        border: "1px solid " + (c.testnet ? C.o : C.r) + "40",
      }}>
        {c.testnet ? "\uD83E\uDDEA TESTNET" : "\u26A0 MAINNET"}
      </span>
      {c.paperTrading && (
        <span style={{
          fontSize: 10, padding: "3px 10px", borderRadius: 4, fontWeight: 700, fontFamily: "monospace",
          background: C.y + "18",
          color: C.y,
          border: "1px solid " + C.y + "40",
        }}>
          PAPER
        </span>
      )}
    </div>
  );
}

function ConfigSlider(props: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; unit: string; color: string; tip: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.txM, fontFamily: "monospace", marginBottom: 2 }}>
        <span style={{ textTransform: "uppercase", fontWeight: 600 }}>{props.label}</span>
        <span style={{ color: props.color, fontWeight: 700 }}>{props.value}{props.unit}</span>
      </div>
      <input
        type="range" min={props.min} max={props.max} step={props.step}
        value={props.value}
        onChange={function(e) { props.onChange(parseFloat(e.target.value)); }}
        style={{ width: "100%", accentColor: props.color }}
      />
      <div style={{ fontSize: 8, color: C.txD }}>{props.tip}</div>
    </div>
  );
}

function PositionRow(props: { trade: BotTrade; fundingAPR?: number }) {
  var t = props.trade;
  var pnlColor = t.pnl >= 0 ? C.g : C.r;
  var holdHours = t.exitTime
    ? ((t.exitTime - t.entryTime) / 3600000).toFixed(1)
    : ((Date.now() - t.entryTime) / 3600000).toFixed(1);

  // Determine if current funding rate still favors our position
  var apr = props.fundingAPR;
  var fundingColor = C.txD;
  var fundingText = "-";
  if (apr !== undefined) {
    var favorsUs = (t.direction === "short" && apr > 0) || (t.direction === "long" && apr < 0);
    fundingColor = favorsUs ? C.g : C.r;
    fundingText = (apr * 100).toFixed(0) + "%";
  }

  return (
    <tr style={{ borderBottom: "1px solid " + C.b + "40", background: t.paper ? C.y + "06" : "transparent" }}>
      <td style={{ padding: "6px 6px", color: C.a, fontWeight: 700 }}>
        {t.coin}
        {t.paper && <span style={{ fontSize: 7, marginLeft: 4, padding: "1px 3px", borderRadius: 2, background: C.y + "20", color: C.y, fontWeight: 700 }}>P</span>}
      </td>
      <td style={{ padding: "6px 6px" }}>
        <span style={{
          fontSize: 8, padding: "1px 5px", borderRadius: 3, fontWeight: 700,
          background: (t.direction === "long" ? C.g : C.r) + "18",
          color: t.direction === "long" ? C.g : C.r
        }}>
          {t.direction.toUpperCase()}
        </span>
      </td>
      <td style={{ padding: "6px 6px", color: C.txM }}>${t.sizeUSD}</td>
      <td style={{ padding: "6px 6px", color: C.txM }}>{t.leverage}x</td>
      <td style={{ padding: "6px 6px", color: C.txM }}>${t.entryPrice.toFixed(2)}</td>
      <td style={{ padding: "6px 6px", color: pnlColor, fontWeight: 600 }}>${t.pnl.toFixed(2)}</td>
      <td style={{ padding: "6px 6px", color: t.fundingEarned >= 0 ? C.g : C.r }}>${t.fundingEarned.toFixed(4)}</td>
      <td style={{ padding: "6px 6px", color: fundingColor, fontWeight: 600 }}>{fundingText}</td>
      <td style={{ padding: "6px 6px", color: C.txM }}>{holdHours}h</td>
      <td style={{ padding: "6px 6px" }}>
        <span style={{
          fontSize: 8, padding: "1px 5px", borderRadius: 3, fontWeight: 700,
          background: (t.status === "open" ? C.a : t.status === "closed" ? C.txD : C.r) + "18",
          color: t.status === "open" ? C.a : t.status === "closed" ? C.txD : C.r,
        }}>
          {t.status.toUpperCase()}
        </span>
      </td>
    </tr>
  );
}

// ── Main Component ──

export default function BotView() {
  var [config, setConfig] = useState<BotConfig>(DEFAULT_CONFIG);
  var [status, setStatus] = useState<BotStatus | null>(null);
  var [loading, setLoading] = useState(false);
  var [error, setError] = useState<string | null>(null);
  var [saving, setSaving] = useState(false);
  var [statusMsg, setStatusMsg] = useState<string | null>(null);
  var [walletAddress, setWalletAddress] = useState<string>("");
  var [accountError, setAccountError] = useState<string>("");
  var [fundingRates, setFundingRates] = useState<Record<string, number>>({});

  // Fetch bot status
  var fetchStatus = useCallback(async function() {
    try {
      var res = await fetch("/api/bot/status");
      if (!res.ok) throw new Error("Status API " + res.status);
      var json = await res.json();
      if (json.ok) {
        setStatus(json);
        setConfig(json.config || DEFAULT_CONFIG);
        setError(null);
        if (json.walletAddress) setWalletAddress(json.walletAddress);
        if (json.accountError) setAccountError(json.accountError);
        else setAccountError("");
        if (json.fundingRates) setFundingRates(json.fundingRates);
      }
    } catch (e: any) {
      // API doesn't exist yet — that's OK
      setError("Bot API not connected. Deploy bot-tick cron and status API to enable.");
    }
  }, []);

  // Poll every 30 seconds
  useEffect(function() {
    fetchStatus();
    var interval = setInterval(fetchStatus, 30000);
    return function() { clearInterval(interval); };
  }, [fetchStatus]);

  // Save config
  var saveConfig = useCallback(async function() {
    setSaving(true);
    setStatusMsg(null);
    try {
      var res = await fetch("/api/bot/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error("Save failed: " + res.status);
      setStatusMsg("Config saved!");
      setTimeout(function() { setStatusMsg(null); }, 3000);
    } catch (e: any) {
      setStatusMsg("Save failed: " + (e.message || "unknown"));
    } finally {
      setSaving(false);
    }
  }, [config]);

  // Kill switch — actually closes positions on Hyperliquid
  var [killing, setKilling] = useState(false);
  var killAll = useCallback(async function() {
    var killMsg = config.paperTrading
      ? "Close all PAPER positions and disable bot?"
      : "CLOSE ALL POSITIONS on Hyperliquid and disable bot?";
    if (!confirm(killMsg)) return;
    setKilling(true);
    setStatusMsg("Closing all positions...");
    try {
      var res = await fetch("/api/bot/kill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      var json = await res.json();
      setConfig(function(c) { return { ...c, enabled: false }; });
      if (json.ok) {
        setStatusMsg("KILLED: " + (json.closed || []).length + " position(s) closed. " + (json.errors && json.errors.length > 0 ? "Errors: " + json.errors.join(", ") : ""));
      } else {
        setStatusMsg("Kill error: " + (json.error || "unknown"));
      }
      // Refresh status after kill
      setTimeout(fetchStatus, 2000);
    } catch (e: any) {
      setStatusMsg("Kill failed: " + (e.message || "unknown"));
    } finally {
      setKilling(false);
    }
  }, [fetchStatus]);

  // Update config field helper
  var upd = function(field: string, value: any) {
    setConfig(function(c) { var n: any = {}; for (var k in c) n[k] = (c as any)[k]; n[field] = value; return n; });
  };

  var positions = status?.openPositions || [];
  var actions = status?.recentActions || [];

  return (
    <div style={{ padding: "16px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 20, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700 }}>
          <span style={{ color: C.g }}>Funding Rate</span> Bot
        </h2>
        <div style={{ fontSize: 11, color: C.txM }}>
          Automated funding rate arbitrage — enters positions when rates spike, exits when they revert
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 8, background: C.o + "12", border: "1px solid " + C.o + "30", color: C.o, fontSize: 11, marginBottom: 14 }}>
          {"\u26A0"} {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 14, alignItems: "start" }}>
        {/* ═══ LEFT: Config Panel ═══ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Status */}
          <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 10, color: C.txD, textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>{"\u2699"} Status</div>
            <StatusBadge config={config} />

            {status && (
              <div style={{ marginTop: 10, fontSize: 11, color: C.txM, lineHeight: 1.8 }}>
                <div>{config.paperTrading ? "Paper Balance" : "Balance"}: <span style={{ color: C.g, fontWeight: 600 }}>${(status.accountBalance || 0).toFixed(2)}</span></div>
                <div>Margin Used: <span style={{ color: C.o, fontWeight: 600 }}>${(status.marginUsed || 0).toFixed(2)}</span></div>
                <div>Open Positions: <span style={{ color: C.a, fontWeight: 600 }}>{positions.length}</span></div>
              </div>
            )}
            {walletAddress && (
              <div style={{ marginTop: 6, fontSize: 9, color: C.txD, wordBreak: "break-all" }}>
                Wallet: {walletAddress}
              </div>
            )}
            {accountError && (
              <div style={{ marginTop: 6, fontSize: 9, color: C.r, wordBreak: "break-all" }}>
                {"\u26A0"} {accountError}
              </div>
            )}
          </div>

          {/* Toggle Controls */}
          <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 10, color: C.txD, textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>{"\uD83D\uDD27"} Controls</div>

            {/* Enable/Disable */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 10, color: C.txM, fontFamily: "monospace" }}>Bot Enabled</span>
              <button
                onClick={function() { upd("enabled", !config.enabled); }}
                style={{
                  padding: "4px 12px", borderRadius: 5, border: "1px solid " + (config.enabled ? C.g : C.r) + "40",
                  background: (config.enabled ? C.g : C.r) + "15",
                  color: config.enabled ? C.g : C.r,
                  fontSize: 10, fontWeight: 700, fontFamily: "monospace", cursor: "pointer",
                }}
              >
                {config.enabled ? "ON" : "OFF"}
              </button>
            </div>

            {/* Testnet toggle */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 10, color: C.txM, fontFamily: "monospace" }}>Testnet Mode</span>
              <button
                onClick={function() { upd("testnet", !config.testnet); }}
                style={{
                  padding: "4px 12px", borderRadius: 5, border: "1px solid " + (config.testnet ? C.o : C.r) + "40",
                  background: (config.testnet ? C.o : C.r) + "15",
                  color: config.testnet ? C.o : C.r,
                  fontSize: 10, fontWeight: 700, fontFamily: "monospace", cursor: "pointer",
                }}
              >
                {config.testnet ? "TESTNET" : "MAINNET"}
              </button>
            </div>

            {/* Spot Hedge */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 10, color: C.txM, fontFamily: "monospace" }}>Spot Hedge</span>
              <button
                onClick={function() { upd("spotHedge", !config.spotHedge); }}
                style={{
                  padding: "4px 12px", borderRadius: 5, border: "1px solid " + (config.spotHedge ? C.p : C.txD) + "40",
                  background: (config.spotHedge ? C.p : C.txD) + "15",
                  color: config.spotHedge ? C.p : C.txD,
                  fontSize: 10, fontWeight: 700, fontFamily: "monospace", cursor: "pointer",
                }}
              >
                {config.spotHedge ? "ON" : "OFF"}
              </button>
            </div>

            {/* Paper Trading */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 10, color: C.txM, fontFamily: "monospace" }}>Paper Trading</span>
              <button
                onClick={function() { upd("paperTrading", !config.paperTrading); }}
                style={{
                  padding: "4px 12px", borderRadius: 5, border: "1px solid " + (config.paperTrading ? C.y : C.txD) + "40",
                  background: (config.paperTrading ? C.y : C.txD) + "15",
                  color: config.paperTrading ? C.y : C.txD,
                  fontSize: 10, fontWeight: 700, fontFamily: "monospace", cursor: "pointer",
                }}
              >
                {config.paperTrading ? "PAPER" : "LIVE"}
              </button>
            </div>
          </div>

          {/* Parameter Sliders */}
          <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 10, color: C.txD, textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>{"\u2699"} Parameters</div>

            <ConfigSlider label="Entry APR Threshold" value={+(config.entryAPR * 100).toFixed(0)} onChange={function(v) { upd("entryAPR", v / 100); }} min={100} max={5000} step={50} unit="%" color={C.o} tip="Min funding APR to open a position" />
            <ConfigSlider label="Exit APR Threshold" value={+(config.exitAPR * 100).toFixed(0)} onChange={function(v) { upd("exitAPR", v / 100); }} min={10} max={500} step={10} unit="%" color={C.g} tip="Close when funding drops below this APR" />
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.txM, fontFamily: "monospace", marginBottom: 2 }}>
                <span style={{ textTransform: "uppercase", fontWeight: 600 }}>Max Position Size</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ color: C.a, fontFamily: "monospace", fontWeight: 700, fontSize: 12 }}>$</span>
                <input
                  type="number" min={1} max={100000} step={1}
                  value={config.maxPositionUSD}
                  onChange={function(e) { var v = parseFloat(e.target.value); if (v > 0) upd("maxPositionUSD", v); }}
                  style={{
                    flex: 1, padding: "6px 8px", borderRadius: 6, fontSize: 12,
                    fontFamily: "monospace", fontWeight: 700, color: C.a,
                    background: C.sL, border: "1px solid " + C.b,
                    outline: "none",
                  }}
                />
              </div>
              <div style={{ fontSize: 8, color: C.txD }}>Max USD per position (type any amount)</div>
            </div>
            <ConfigSlider label="Leverage" value={config.leverage} onChange={function(v) { upd("leverage", v); }} min={1} max={20} step={1} unit="x" color={C.p} tip="Default leverage for new positions" />
            <ConfigSlider label="Max Positions" value={config.maxPositions} onChange={function(v) { upd("maxPositions", v); }} min={1} max={10} step={1} unit="" color={C.a} tip="Max concurrent open positions" />
            <ConfigSlider label="Stop Loss" value={config.stopLossPct} onChange={function(v) { upd("stopLossPct", v); }} min={1} max={25} step={0.5} unit="%" color={C.r} tip="Close if unrealized loss exceeds this %" />
            <ConfigSlider label="Max Hold Time" value={config.maxHoldHours} onChange={function(v) { upd("maxHoldHours", v); }} min={1} max={720} step={1} unit="h" color={C.y} tip="Force close after this many hours" />
            <ConfigSlider label="Funding Lock" value={config.fundingLockMinutes} onChange={function(v) { upd("fundingLockMinutes", v); }} min={0} max={55} step={5} unit="min" color={C.p} tip="Hold position this many minutes before funding settlement (0 = off)" />
            {config.paperTrading && (
              <ConfigSlider label="Paper Balance" value={config.paperBalance} onChange={function(v) { upd("paperBalance", v); }} min={100} max={100000} step={100} unit="$" color={C.y} tip="Simulated starting balance for paper trading" />
            )}
            {config.spotHedge && (
              <ConfigSlider label="Hedge Ratio" value={+(config.spotHedgeRatio * 100).toFixed(0)} onChange={function(v) { upd("spotHedgeRatio", v / 100); }} min={10} max={200} step={5} unit="%" color={C.p} tip="Spot hedge as % of perp size" />
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={saveConfig} disabled={saving} style={{
              flex: 1, padding: "12px 16px", borderRadius: 8, border: "1px solid " + C.g + "50",
              background: "linear-gradient(135deg," + C.g + "15," + C.a + "10)",
              color: C.g, fontFamily: "monospace", fontSize: 12, fontWeight: 700,
              cursor: saving ? "wait" : "pointer",
            }}>
              {saving ? "\u27F3" : "\u2714"} Save Config
            </button>
            <button onClick={killAll} disabled={killing} style={{
              flex: 1, padding: "12px 16px", borderRadius: 8, border: "1px solid " + C.r + "50",
              background: "linear-gradient(135deg," + C.r + "15," + C.r + "08)",
              color: C.r, fontFamily: "monospace", fontSize: 12, fontWeight: 700, cursor: killing ? "wait" : "pointer",
            }}>
              {killing ? "\u27F3 Closing..." : "\u26D4 Kill Switch"}
            </button>
          </div>

          {statusMsg && (
            <div style={{ fontSize: 10, color: statusMsg.includes("fail") || statusMsg.includes("error") ? C.r : C.g, textAlign: "center", padding: 4 }}>
              {statusMsg}
            </div>
          )}
        </div>

        {/* ═══ RIGHT: Positions + Activity ═══ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Open Positions */}
          <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, marginBottom: 10 }}>
              <span style={{ color: C.a }}>Active</span> Positions
              {positions.length > 0 && <span style={{ fontSize: 10, color: C.txD, fontWeight: 400, marginLeft: 6 }}>({positions.length})</span>}
            </div>

            {positions.length === 0 ? (
              <div style={{ textAlign: "center", padding: 30, color: C.txD, fontSize: 11 }}>
                No open positions. Bot will enter when funding rates spike above {(config.entryAPR * 100).toFixed(0)}% APR.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: "monospace" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid " + C.b }}>
                      {["Coin", "Dir", "Size", "Lev", "Entry", "PnL", "Funding", "Live APR", "Hold", "Status"].map(function(h) {
                        return <th key={h} style={{ padding: "5px 6px", textAlign: "left", color: C.txD, fontWeight: 600, fontSize: 8, textTransform: "uppercase" }}>{h}</th>;
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map(function(t) { return <PositionRow key={t.id} trade={t} fundingAPR={fundingRates[t.coin]} />; })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Strategy Summary */}
          <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, marginBottom: 10 }}>
              <span style={{ color: C.y }}>Strategy</span> Summary
            </div>
            <div style={{ fontSize: 11, color: C.txM, lineHeight: 1.8 }}>
              <div>{"\uD83D\uDD0D"} <strong>Scan:</strong> Every 10 min, check funding rates across all Hyperliquid perps</div>
              <div>{"\u2197"} <strong>Entry:</strong> Open position when funding APR &gt; <span style={{ color: C.o, fontWeight: 600 }}>{(config.entryAPR * 100).toFixed(0)}%</span></div>
              <div style={{ paddingLeft: 20 }}>
                {"\u2022"} Positive funding = <span style={{ color: C.r }}>SHORT</span> perp (longs pay you)
              </div>
              <div style={{ paddingLeft: 20 }}>
                {"\u2022"} Negative funding = <span style={{ color: C.g }}>LONG</span> perp (shorts pay you)
              </div>
              {config.spotHedge && (
                <div style={{ paddingLeft: 20 }}>
                  {"\u2022"} + Opposing <span style={{ color: C.p }}>spot</span> position for delta-neutral ({(config.spotHedgeRatio * 100).toFixed(0)}% ratio)
                </div>
              )}
              <div>{"\u2198"} <strong>Exit:</strong> Close when funding APR &lt; <span style={{ color: C.g, fontWeight: 600 }}>{(config.exitAPR * 100).toFixed(0)}%</span></div>
              <div>{"\u26D4"} <strong>Stop Loss:</strong> Close if unrealized loss &gt; <span style={{ color: C.r, fontWeight: 600 }}>{config.stopLossPct}%</span></div>
              <div>{"\u23F0"} <strong>Max Hold:</strong> Force close after <span style={{ color: C.y, fontWeight: 600 }}>{config.maxHoldHours}h</span></div>
              <div>{"\uD83D\uDCB0"} <strong>Size:</strong> Up to <span style={{ color: C.a, fontWeight: 600 }}>${config.maxPositionUSD}</span> at <span style={{ color: C.p, fontWeight: 600 }}>{config.leverage}x</span> leverage</div>
              <div>{"\uD83D\uDCCA"} <strong>Max Positions:</strong> <span style={{ color: C.a, fontWeight: 600 }}>{config.maxPositions}</span> concurrent</div>
            </div>
          </div>

          {/* Activity Log */}
          <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, marginBottom: 10 }}>
              <span style={{ color: C.p }}>Activity</span> Log
            </div>

            {actions.length === 0 ? (
              <div style={{ textAlign: "center", padding: 20, color: C.txD, fontSize: 11 }}>
                No recent activity. Bot actions will appear here once the bot-tick cron is running.
              </div>
            ) : (
              <div style={{ maxHeight: 300, overflowY: "auto" }}>
                {actions.map(function(a, i) {
                  return (
                    <div key={i} style={{ display: "flex", gap: 8, padding: "4px 0", borderBottom: "1px solid " + C.b + "30", fontSize: 10 }}>
                      <span style={{ color: C.txD, minWidth: 70 }}>
                        {new Date(a.time).toLocaleTimeString()}
                      </span>
                      <span style={{ color: C.a, fontWeight: 600, minWidth: 60 }}>{a.action}</span>
                      <span style={{ color: C.txM }}>{a.detail}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
