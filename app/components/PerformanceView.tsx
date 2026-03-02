"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, AreaChart, Area,
} from "recharts";
import { C } from "../utils/constants";
import type { BotTrade, PerformanceStats } from "../types";

// ── Helpers ──

function fmtDate(ms: number): string {
  var d = new Date(ms);
  var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return months[d.getUTCMonth()] + " " + d.getUTCDate();
}

function computeStats(trades: BotTrade[]): PerformanceStats {
  var open = trades.filter(function(t) { return t.status === "open"; });
  var closed = trades.filter(function(t) { return t.status !== "open"; });
  var winners = closed.filter(function(t) { return t.totalReturn > 0; });
  var longTrades = closed.filter(function(t) { return t.direction === "long"; });
  var shortTrades = closed.filter(function(t) { return t.direction === "short"; });
  var longWins = longTrades.filter(function(t) { return t.totalReturn > 0; });
  var shortWins = shortTrades.filter(function(t) { return t.totalReturn > 0; });

  var returns = closed.map(function(t) { return t.totalReturn; });
  var holdTimes = closed.map(function(t) { return t.exitTime ? (t.exitTime - t.entryTime) / 3600000 : 0; });

  return {
    totalTrades: trades.length,
    openTrades: open.length,
    closedTrades: closed.length,
    totalPnL: trades.reduce(function(s, t) { return s + t.pnl; }, 0),
    totalFundingEarned: trades.reduce(function(s, t) { return s + t.fundingEarned; }, 0),
    winRate: closed.length > 0 ? (winners.length / closed.length) * 100 : 0,
    avgReturn: returns.length > 0 ? returns.reduce(function(s, v) { return s + v; }, 0) / returns.length : 0,
    bestTrade: returns.length > 0 ? Math.max.apply(null, returns) : 0,
    worstTrade: returns.length > 0 ? Math.min.apply(null, returns) : 0,
    avgHoldHours: holdTimes.length > 0 ? holdTimes.reduce(function(s, v) { return s + v; }, 0) / holdTimes.length : 0,
    longWinRate: longTrades.length > 0 ? (longWins.length / longTrades.length) * 100 : 0,
    shortWinRate: shortTrades.length > 0 ? (shortWins.length / shortTrades.length) * 100 : 0,
  };
}

// ── Sub-Components ──

function StatCards(props: { stats: PerformanceStats }) {
  var s = props.stats;
  var cards = [
    { label: "Total Trades", value: s.totalTrades.toString(), color: C.a, icon: "#" },
    { label: "Win Rate", value: s.winRate.toFixed(1) + "%", color: s.winRate >= 50 ? C.g : C.r, icon: "\u2714" },
    { label: "Total PnL", value: "$" + s.totalPnL.toFixed(2), color: s.totalPnL >= 0 ? C.g : C.r, icon: "$" },
    { label: "Funding Earned", value: "$" + s.totalFundingEarned.toFixed(4), color: C.g, icon: "\uD83D\uDCB0" },
    { label: "Best Trade", value: "$" + s.bestTrade.toFixed(2), color: C.g, icon: "\u25B2" },
    { label: "Worst Trade", value: "$" + s.worstTrade.toFixed(2), color: C.r, icon: "\u25BC" },
    { label: "Avg Hold", value: s.avgHoldHours.toFixed(1) + "h", color: C.o, icon: "\u23F1" },
    { label: "Open", value: s.openTrades.toString(), color: C.a, icon: "\u25CF" },
  ];

  return (
    <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 14 }}>
      {cards.map(function(c) {
        return (
          <div key={c.label} style={{ background: C.sL, border: "1px solid " + C.b, borderRadius: 9, padding: "10px 12px", minWidth: 115 }}>
            <div style={{ fontSize: 9, color: C.txD, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 4 }}>{c.icon} {c.label}</div>
            <div style={{ fontSize: 16, color: c.color, fontFamily: "monospace", fontWeight: 700 }}>{c.value}</div>
          </div>
        );
      })}
    </div>
  );
}

function EquityCurve(props: { trades: BotTrade[] }) {
  var closed = props.trades
    .filter(function(t) { return t.status !== "open" && t.exitTime; })
    .slice()
    .sort(function(a, b) { return (a.exitTime || 0) - (b.exitTime || 0); });

  if (closed.length < 2) return null;

  var cum = 0;
  var data = closed.map(function(t) {
    cum += t.totalReturn;
    return { date: fmtDate(t.exitTime!), pnl: +cum.toFixed(2), funding: +t.fundingEarned.toFixed(4) };
  });

  return (
    <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, marginBottom: 8 }}>
        <span style={{ color: C.g }}>Equity</span> Curve
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
          <defs>
            <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={C.g} stopOpacity={0.3} />
              <stop offset="95%" stopColor={C.g} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={C.b} />
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: C.txD }} stroke={C.b} />
          <YAxis tick={{ fontSize: 9, fill: C.txD }} stroke={C.b} tickFormatter={function(v: number) { return "$" + v; }} />
          <Tooltip
            contentStyle={{ background: C.s, border: "1px solid " + C.bL, borderRadius: 6, fontSize: 10, fontFamily: "monospace" }}
            formatter={function(v: any, name: string) { return ["$" + v, name === "pnl" ? "Cumulative P&L" : "Funding"]; }}
          />
          <Area type="monotone" dataKey="pnl" stroke={C.g} fill="url(#pnlGrad)" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function TokenBreakdown(props: { trades: BotTrade[] }) {
  var closed = props.trades.filter(function(t) { return t.status !== "open"; });
  if (closed.length === 0) return null;

  var byToken: Record<string, { pnl: number; funding: number; count: number }> = {};
  closed.forEach(function(t) {
    if (!byToken[t.coin]) byToken[t.coin] = { pnl: 0, funding: 0, count: 0 };
    byToken[t.coin].pnl += t.totalReturn;
    byToken[t.coin].funding += t.fundingEarned;
    byToken[t.coin].count++;
  });

  var data = Object.keys(byToken).map(function(coin) {
    return { coin: coin, pnl: +byToken[coin].pnl.toFixed(2), funding: +byToken[coin].funding.toFixed(4), count: byToken[coin].count };
  }).sort(function(a, b) { return b.pnl - a.pnl; });

  return (
    <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, marginBottom: 8 }}>
        <span style={{ color: C.a }}>Per-Token</span> P&L
      </div>
      <ResponsiveContainer width="100%" height={Math.max(180, data.length * 30 + 40)}>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 10, left: 50, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.b} />
          <XAxis type="number" tick={{ fontSize: 9, fill: C.txD }} stroke={C.b} tickFormatter={function(v: number) { return "$" + v; }} />
          <YAxis type="category" dataKey="coin" tick={{ fontSize: 10, fill: C.txM, fontWeight: 600 }} stroke={C.b} />
          <Tooltip
            contentStyle={{ background: C.s, border: "1px solid " + C.bL, borderRadius: 6, fontSize: 10, fontFamily: "monospace" }}
            formatter={function(v: any, name: string) { return ["$" + v, name === "pnl" ? "Total P&L" : name]; }}
          />
          <Bar dataKey="pnl" radius={[0, 4, 4, 0]}>
            {data.map(function(d, i) {
              return <Cell key={i} fill={d.pnl >= 0 ? C.g : C.r} fillOpacity={0.7} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DirectionAnalysis(props: { stats: PerformanceStats }) {
  var s = props.stats;
  return (
    <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, marginBottom: 10 }}>
        <span style={{ color: C.y }}>Direction</span> Analysis
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ background: C.g + "08", border: "1px solid " + C.g + "25", borderRadius: 8, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, color: C.g, fontWeight: 700, marginBottom: 6 }}>{"\u2197"} Long Trades</div>
          <div style={{ fontSize: 22, fontFamily: "monospace", fontWeight: 700, color: s.longWinRate >= 50 ? C.g : C.r }}>
            {s.longWinRate.toFixed(1)}%
          </div>
          <div style={{ fontSize: 9, color: C.txD }}>Win Rate</div>
        </div>
        <div style={{ background: C.r + "08", border: "1px solid " + C.r + "25", borderRadius: 8, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, color: C.r, fontWeight: 700, marginBottom: 6 }}>{"\u2198"} Short Trades</div>
          <div style={{ fontSize: 22, fontFamily: "monospace", fontWeight: 700, color: s.shortWinRate >= 50 ? C.g : C.r }}>
            {s.shortWinRate.toFixed(1)}%
          </div>
          <div style={{ fontSize: 9, color: C.txD }}>Win Rate</div>
        </div>
      </div>
    </div>
  );
}

function TradeHistory(props: { trades: BotTrade[] }) {
  var sorted = props.trades.slice().sort(function(a, b) { return b.entryTime - a.entryTime; });

  if (sorted.length === 0) return null;

  return (
    <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, marginBottom: 10 }}>
        <span style={{ color: C.p }}>Trade</span> History
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: "monospace" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid " + C.b }}>
              {["Coin", "Dir", "Size", "Entry", "Exit", "PnL", "Funding", "Total", "Reason", "Status"].map(function(h) {
                return <th key={h} style={{ padding: "5px 6px", textAlign: "left", color: C.txD, fontWeight: 600, fontSize: 8, textTransform: "uppercase" }}>{h}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map(function(t) {
              var totalColor = t.totalReturn >= 0 ? C.g : C.r;
              return (
                <tr key={t.id} style={{ borderBottom: "1px solid " + C.b + "40" }}>
                  <td style={{ padding: "6px 6px", color: C.a, fontWeight: 700 }}>
                    {t.coin}
                    {t.paper && (
                      <span style={{ marginLeft: 4, fontSize: 7, padding: "1px 3px", borderRadius: 3, background: C.y + "20", color: C.y, fontWeight: 700 }}>P</span>
                    )}
                  </td>
                  <td style={{ padding: "6px 6px" }}>
                    <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, fontWeight: 700, background: (t.direction === "long" ? C.g : C.r) + "18", color: t.direction === "long" ? C.g : C.r }}>
                      {t.direction.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: "6px 6px", color: C.txM }}>${t.sizeUSD}</td>
                  <td style={{ padding: "6px 6px", color: C.txM }}>${t.entryPrice.toFixed(2)}</td>
                  <td style={{ padding: "6px 6px", color: C.txM }}>{t.exitPrice ? "$" + t.exitPrice.toFixed(2) : "-"}</td>
                  <td style={{ padding: "6px 6px", color: t.pnl >= 0 ? C.g : C.r, fontWeight: 600 }}>${t.pnl.toFixed(2)}</td>
                  <td style={{ padding: "6px 6px", color: t.fundingEarned >= 0 ? C.g : C.r }}>${t.fundingEarned.toFixed(4)}</td>
                  <td style={{ padding: "6px 6px", color: totalColor, fontWeight: 700 }}>${t.totalReturn.toFixed(2)}</td>
                  <td style={{ padding: "6px 6px", color: C.txD }}>{t.exitReason || "-"}</td>
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
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Component ──

export default function PerformanceView() {
  var [trades, setTrades] = useState<BotTrade[]>([]);
  var [loading, setLoading] = useState(false);
  var [error, setError] = useState<string | null>(null);
  var [tradeFilter, setTradeFilter] = useState<string>("auto"); // "auto", "paper", "live"

  var fetchTrades = useCallback(async function() {
    setLoading(true);
    try {
      var param = tradeFilter === "paper" ? "?paper=true" : tradeFilter === "live" ? "?paper=false" : "";
      var res = await fetch("/api/bot/trades" + param);
      if (!res.ok) throw new Error("Trades API " + res.status);
      var json = await res.json();
      if (json.ok) {
        setTrades(json.trades || []);
        setError(null);
      }
    } catch (e: any) {
      setError("Trades API not connected. Deploy bot engine and run some trades first.");
    } finally {
      setLoading(false);
    }
  }, [tradeFilter]);

  useEffect(function() {
    fetchTrades();
  }, [fetchTrades]);

  var stats = useMemo(function() { return computeStats(trades); }, [trades]);

  return (
    <div style={{ padding: "16px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 20, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700 }}>
          <span style={{ color: C.p }}>Bot</span> Performance
        </h2>
        <div style={{ fontSize: 11, color: C.txM }}>
          Track P&L, win rates, and funding income across all bot trades
        </div>

        {/* Paper / Live filter */}
        <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
          {[
            { key: "auto", label: "Current Mode" },
            { key: "live", label: "Live Trades" },
            { key: "paper", label: "Paper Trades" },
          ].map(function(opt) {
            var active = tradeFilter === opt.key;
            var col = opt.key === "paper" ? C.y : opt.key === "live" ? C.g : C.a;
            return (
              <button
                key={opt.key}
                onClick={function() { setTradeFilter(opt.key); }}
                style={{
                  padding: "4px 10px", borderRadius: 5, fontSize: 9, fontFamily: "monospace",
                  fontWeight: 700, cursor: "pointer", letterSpacing: ".03em",
                  background: active ? col + "20" : "transparent",
                  border: "1px solid " + (active ? col + "50" : C.b),
                  color: active ? col : C.txD,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 8, background: C.o + "12", border: "1px solid " + C.o + "30", color: C.o, fontSize: 11, marginBottom: 14 }}>
          {"\u26A0"} {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: 60, color: C.txD, fontSize: 12 }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>{"\u27F3"}</div>
          Loading trade history...
        </div>
      )}

      {/* No trades */}
      {!loading && trades.length === 0 && !error && (
        <div style={{ textAlign: "center", padding: 60, color: C.txD, fontSize: 12 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>{"\uD83C\uDFC6"}</div>
          No trades recorded yet. Configure and enable the bot in the <span style={{ color: C.g, fontWeight: 700 }}>Bot</span> tab to start trading.
        </div>
      )}

      {/* Performance Data */}
      {trades.length > 0 && (
        <>
          <StatCards stats={stats} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <EquityCurve trades={trades} />
            <DirectionAnalysis stats={stats} />
          </div>

          <TokenBreakdown trades={trades} />
          <TradeHistory trades={trades} />

          {/* Refresh */}
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button onClick={fetchTrades} disabled={loading} style={{
              padding: "8px 20px", borderRadius: 6, border: "1px solid " + C.p + "40",
              background: C.p + "10", color: C.p, fontSize: 10, fontFamily: "monospace",
              fontWeight: 600, cursor: "pointer",
            }}>
              {"\u21BB"} Refresh
            </button>
          </div>
        </>
      )}
    </div>
  );
}
