"use client";
import { useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, ScatterChart, Scatter, ZAxis,
} from "recharts";
import { C } from "../utils/constants";
import { useBacktest } from "../hooks/useBacktest";
import type { BacktestEpisode } from "../types";

// ── Helpers ──

function fmtDate(ms: number): string {
  var d = new Date(ms);
  var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return months[d.getUTCMonth()] + " " + d.getUTCDate();
}

function fmtAPR(apr: number): string {
  var pct = apr * 100;
  return pct >= 100 ? pct.toFixed(0) + "%" : pct.toFixed(1) + "%";
}

function fmtPct(val: number | null): string {
  if (val === null) return "-";
  return (val * 100).toFixed(4) + "%";
}

function fmtPrice(val: number | null): string {
  if (val === null) return "-";
  if (val >= 1000) return "$" + val.toFixed(0);
  if (val >= 1) return "$" + val.toFixed(2);
  return "$" + val.toFixed(4);
}

// ── Sub-Components ──

function SummaryCards(props: { data: any }) {
  var d = props.data;
  var holdH = d.avgHoldHours || 0;
  var fundH = d.avgFundingHold || 0;
  var priceP = d.avgPricePnl || 0;
  var netR = d.avgNetReturn || 0;
  var medNet = d.medianNetReturn || 0;
  var cards = [
    { label: "Episodes", value: d.totalEpisodes, color: C.a, icon: "#" },
    { label: "Avg Hold", value: holdH.toFixed(1) + "h", color: C.o, icon: "\u23F1" },
    { label: "Revert <100%", value: d.revertPct.toFixed(1) + "%", color: C.g, icon: "\u21B5" },
    { label: "Avg Revert Time", value: d.avgRevertHours.toFixed(1) + "h", color: C.p, icon: "\u21BA" },
    { label: "Hold Funding", value: (fundH * 100).toFixed(4) + "%", color: C.g, icon: "\uD83D\uDCB0" },
    { label: "Avg Price P&L", value: (priceP * 100).toFixed(4) + "%", color: priceP >= 0 ? C.g : C.r, icon: "\uD83D\uDCC9" },
    { label: "Avg Net Return", value: (netR * 100).toFixed(4) + "%", color: netR >= 0 ? C.g : C.r, icon: "\uD83D\uDCCA" },
    { label: "Med Net Return", value: (medNet * 100).toFixed(4) + "%", color: medNet >= 0 ? C.g : C.r, icon: "\u03BC" },
  ];
  return (
    <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 14 }}>
      {cards.map(function(c) {
        return (
          <div key={c.label} style={{ background: C.sL, border: "1px solid " + C.b, borderRadius: 9, padding: "10px 12px", minWidth: 120 }}>
            <div style={{ fontSize: 9, color: C.txD, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 4 }}>{c.icon} {c.label}</div>
            <div style={{ fontSize: 16, color: c.color, fontFamily: "monospace", fontWeight: 700 }}>{c.value}</div>
          </div>
        );
      })}
    </div>
  );
}

function DecayChart(props: { curve: Record<string, number> }) {
  var windows = ["1h", "4h", "12h", "24h", "48h", "168h"];
  var data = windows.map(function(w) {
    return { window: w, apr: +((props.curve[w] || 0) * 100).toFixed(1) };
  });

  return (
    <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, marginBottom: 4 }}>
        <span style={{ color: C.o }}>APR Decay</span> After Spike
      </div>
      <div style={{ fontSize: 10, color: C.txM, marginBottom: 10 }}>Average APR at each time window after a funding spike begins</div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.b} />
          <XAxis dataKey="window" tick={{ fontSize: 11, fill: C.txM, fontWeight: 600 }} stroke={C.b} />
          <YAxis tick={{ fontSize: 9, fill: C.txD }} stroke={C.b} tickFormatter={function(v: number) { return v + "%"; }} />
          <Tooltip
            contentStyle={{ background: C.s, border: "1px solid " + C.bL, borderRadius: 6, fontSize: 10, fontFamily: "monospace" }}
            formatter={function(v: any) { return [v + "% APR"]; }}
          />
          <Bar dataKey="apr" radius={[4, 4, 0, 0]}>
            {data.map(function(d, i) {
              var intensity = Math.min(1, d.apr / (data[0].apr || 1));
              return <Cell key={i} fill={intensity > 0.5 ? C.o : intensity > 0.2 ? C.y : C.g} fillOpacity={0.75} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TokenTable(props: { summaries: any[] }) {
  if (props.summaries.length === 0) return null;
  var sorted = props.summaries.slice().sort(function(a, b) { return b.episodes - a.episodes; });

  return (
    <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, marginBottom: 10 }}>
        <span style={{ color: C.a }}>Token</span> Ranking
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "monospace" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid " + C.b }}>
              {["Token", "Episodes", "Avg Peak APR", "Avg Hold", "Revert %", "Hold Funding", "Price P&L", "Net Return"].map(function(h) {
                return <th key={h} style={{ padding: "6px 8px", textAlign: "left", color: C.txD, fontWeight: 600, fontSize: 9, textTransform: "uppercase" }}>{h}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map(function(t, i) {
              return (
                <tr key={i} style={{ borderBottom: "1px solid " + C.b + "60" }}>
                  <td style={{ padding: "8px 8px", color: C.a, fontWeight: 700 }}>{t.token}</td>
                  <td style={{ padding: "8px 8px", color: C.tx }}>{t.episodes}</td>
                  <td style={{ padding: "8px 8px", color: C.o, fontWeight: 600 }}>{fmtAPR(t.avgPeakAPR)}</td>
                  <td style={{ padding: "8px 8px", color: C.txM }}>{(t.avgHoldHours || 0).toFixed(1)}h</td>
                  <td style={{ padding: "8px 8px", color: t.revertPct > 60 ? C.g : C.r, fontWeight: 600 }}>{t.revertPct.toFixed(0)}%</td>
                  <td style={{ padding: "8px 8px", color: C.g }}>{((t.avgFundingHold || 0) * 100).toFixed(4)}%</td>
                  <td style={{ padding: "8px 8px", color: (t.avgPricePnl || 0) >= 0 ? C.g : C.r, fontWeight: 600 }}>{((t.avgPricePnl || 0) * 100).toFixed(4)}%</td>
                  <td style={{ padding: "8px 8px", color: (t.avgNetReturn || 0) >= 0 ? C.g : C.r, fontWeight: 700 }}>{((t.avgNetReturn || 0) * 100).toFixed(4)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EpisodeTimeline(props: { episodes: BacktestEpisode[] }) {
  if (props.episodes.length === 0) return null;

  // Group by token, plot as scatter
  var tokens = Array.from(new Set(props.episodes.map(function(e) { return e.token; })));
  var data = props.episodes.map(function(ep) {
    return {
      token: ep.token,
      tokenIdx: tokens.indexOf(ep.token),
      time: ep.startTime,
      date: fmtDate(ep.startTime),
      peakAPR: +(ep.peakAPR * 100).toFixed(0),
      duration: +ep.durationHours.toFixed(1),
      direction: ep.direction,
      active: ep.stillActive,
    };
  });

  return (
    <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, marginBottom: 4 }}>
        <span style={{ color: C.p }}>Episode</span> Timeline
      </div>
      <div style={{ fontSize: 10, color: C.txM, marginBottom: 10 }}>Each dot = one extreme funding episode. Size = peak APR. Color = direction.</div>
      <ResponsiveContainer width="100%" height={Math.max(180, tokens.length * 35 + 60)}>
        <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.b} />
          <XAxis dataKey="date" type="category" tick={{ fontSize: 9, fill: C.txD }} stroke={C.b} allowDuplicatedCategory={false} />
          <YAxis dataKey="token" type="category" tick={{ fontSize: 10, fill: C.txM, fontWeight: 600 }} stroke={C.b} width={60} />
          <ZAxis dataKey="peakAPR" range={[40, 400]} />
          <Tooltip
            contentStyle={{ background: C.s, border: "1px solid " + C.bL, borderRadius: 6, fontSize: 10, fontFamily: "monospace" }}
            formatter={function(v: any, name: string) {
              if (name === "peakAPR") return [v + "% APR", "Peak"];
              if (name === "duration") return [v + "h", "Duration"];
              return [v, name];
            }}
          />
          <Scatter data={data} shape="circle">
            {data.map(function(d, i) {
              return <Cell key={i} fill={d.direction === "long-pays" ? C.r : C.g} fillOpacity={d.active ? 1 : 0.65} />;
            })}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", gap: 14, fontSize: 9, color: C.txM, marginTop: 4 }}>
        <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: C.g, marginRight: 4 }} />Short-pays (SHORT to earn)</span>
        <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: C.r, marginRight: 4 }} />Long-pays (LONG to earn)</span>
      </div>
    </div>
  );
}

function NetReturnDistribution(props: { episodes: BacktestEpisode[] }) {
  if (props.episodes.length === 0) return null;

  // Use net return where available, fall back to funding only
  var returns = props.episodes.map(function(e) {
    var nr = e.netReturn;
    if (nr !== null && nr !== undefined) return nr * 100;
    return (e.cumulativeFundingHold || e.cumulativeFunding7d || 0) * 100;
  });
  var min = Math.min.apply(null, returns);
  var max = Math.max.apply(null, returns);
  var range = max - min || 1;
  var bucketCount = Math.min(20, props.episodes.length);
  var bucketSize = range / bucketCount;

  var buckets: Array<{ label: string; count: number; midpoint: number }> = [];
  for (var bi = 0; bi < bucketCount; bi++) {
    var lo = min + bi * bucketSize;
    var hi = lo + bucketSize;
    var count = returns.filter(function(e) { return e >= lo && (bi === bucketCount - 1 ? e <= hi : e < hi); }).length;
    buckets.push({ label: lo.toFixed(2) + "%", count: count, midpoint: (lo + hi) / 2 });
  }

  return (
    <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, marginBottom: 4 }}>
        <span style={{ color: C.g }}>Net Return</span> Distribution
      </div>
      <div style={{ fontSize: 10, color: C.txM, marginBottom: 10 }}>Net return (funding earned + price P&L) over actual hold period per episode</div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={buckets} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.b} />
          <XAxis dataKey="label" tick={{ fontSize: 8, fill: C.txD }} stroke={C.b} interval={Math.max(0, Math.floor(bucketCount / 8))} />
          <YAxis tick={{ fontSize: 9, fill: C.txD }} stroke={C.b} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: C.s, border: "1px solid " + C.bL, borderRadius: 6, fontSize: 10, fontFamily: "monospace" }}
            formatter={function(v: any) { return [v + " episodes"]; }}
          />
          <Bar dataKey="count" radius={[3, 3, 0, 0]}>
            {buckets.map(function(b, i) {
              return <Cell key={i} fill={b.midpoint >= 0 ? C.g : C.r} fillOpacity={0.7} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DirectionBreakdown(props: { episodes: BacktestEpisode[] }) {
  if (props.episodes.length === 0) return null;

  var longPays = props.episodes.filter(function(e) { return e.direction === "long-pays"; });
  var shortPays = props.episodes.filter(function(e) { return e.direction === "short-pays"; });

  var avgVal = function(arr: BacktestEpisode[], fn: (e: BacktestEpisode) => number) {
    if (arr.length === 0) return 0;
    return arr.reduce(function(s, e) { return s + fn(e); }, 0) / arr.length;
  };

  var avgNullable = function(arr: BacktestEpisode[], fn: (e: BacktestEpisode) => number | null) {
    var withData = arr.filter(function(e) { return fn(e) !== null; });
    if (withData.length === 0) return 0;
    return withData.reduce(function(s, e) { return s + fn(e)!; }, 0) / withData.length;
  };

  var rows = [
    {
      label: "Long-Pays (SHORT to earn)", count: longPays.length, color: C.r,
      avgPeak: avgVal(longPays, function(e) { return e.peakAPR; }),
      avgHold: avgVal(longPays, function(e) { return e.holdHours || e.durationHours; }),
      avgFunding: avgVal(longPays, function(e) { return e.cumulativeFundingHold || e.cumulativeFunding7d; }),
      avgPrice: avgNullable(longPays, function(e) { return e.pricePnlPct; }),
      avgNet: avgNullable(longPays, function(e) { return e.netReturn; }),
    },
    {
      label: "Short-Pays (LONG to earn)", count: shortPays.length, color: C.g,
      avgPeak: avgVal(shortPays, function(e) { return e.peakAPR; }),
      avgHold: avgVal(shortPays, function(e) { return e.holdHours || e.durationHours; }),
      avgFunding: avgVal(shortPays, function(e) { return e.cumulativeFundingHold || e.cumulativeFunding7d; }),
      avgPrice: avgNullable(shortPays, function(e) { return e.pricePnlPct; }),
      avgNet: avgNullable(shortPays, function(e) { return e.netReturn; }),
    },
  ];

  return (
    <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, marginBottom: 10 }}>
        <span style={{ color: C.y }}>Direction</span> Breakdown
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {rows.map(function(r) {
          return (
            <div key={r.label} style={{ background: r.color + "08", border: "1px solid " + r.color + "25", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: r.color, fontWeight: 700, marginBottom: 6 }}>{r.label}</div>
              <div style={{ fontSize: 11, color: C.txM, lineHeight: 1.8 }}>
                <div>Episodes: <span style={{ color: C.tx, fontWeight: 600 }}>{r.count}</span></div>
                <div>Avg Peak: <span style={{ color: C.o, fontWeight: 600 }}>{fmtAPR(r.avgPeak)}</span></div>
                <div>Avg Hold: <span style={{ color: C.txM, fontWeight: 600 }}>{r.avgHold.toFixed(1)}h</span></div>
                <div>Hold Funding: <span style={{ color: C.g, fontWeight: 600 }}>{(r.avgFunding * 100).toFixed(4)}%</span></div>
                <div>Price P&L: <span style={{ color: r.avgPrice >= 0 ? C.g : C.r, fontWeight: 600 }}>{(r.avgPrice * 100).toFixed(4)}%</span></div>
                <div>Net Return: <span style={{ color: r.avgNet >= 0 ? C.g : C.r, fontWeight: 700 }}>{(r.avgNet * 100).toFixed(4)}%</span></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EpisodeTable(props: { episodes: BacktestEpisode[] }) {
  if (props.episodes.length === 0) return null;
  var sorted = props.episodes.slice().sort(function(a, b) { return b.startTime - a.startTime; }).slice(0, 50);

  return (
    <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, marginBottom: 10 }}>
        <span style={{ color: C.a }}>Episode</span> Details <span style={{ fontSize: 10, color: C.txD, fontWeight: 400 }}>(latest 50)</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: "monospace" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid " + C.b }}>
              {["Token", "Date", "Dir", "Peak APR", "Hold", "Reverted", "Funding", "Entry $", "Exit $", "Price P&L", "Net Return"].map(function(h) {
                return <th key={h} style={{ padding: "5px 6px", textAlign: "left", color: C.txD, fontWeight: 600, fontSize: 8, textTransform: "uppercase" }}>{h}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map(function(ep, i) {
              var netColor = ep.netReturn !== null ? (ep.netReturn >= 0 ? C.g : C.r) : C.txD;
              var priceColor = ep.pricePnlPct !== null ? (ep.pricePnlPct >= 0 ? C.g : C.r) : C.txD;
              return (
                <tr key={i} style={{ borderBottom: "1px solid " + C.b + "40" }}>
                  <td style={{ padding: "6px 6px", color: C.a, fontWeight: 700 }}>{ep.token}</td>
                  <td style={{ padding: "6px 6px", color: C.txM }}>{fmtDate(ep.startTime)}</td>
                  <td style={{ padding: "6px 6px" }}>
                    <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, fontWeight: 700, background: (ep.direction === "long-pays" ? C.r : C.g) + "18", color: ep.direction === "long-pays" ? C.r : C.g }}>
                      {ep.direction === "long-pays" ? "SHORT" : "LONG"}
                    </span>
                  </td>
                  <td style={{ padding: "6px 6px", color: C.o, fontWeight: 600 }}>{fmtAPR(ep.peakAPR)}</td>
                  <td style={{ padding: "6px 6px", color: C.txM }}>{(ep.holdHours || ep.durationHours).toFixed(1)}h</td>
                  <td style={{ padding: "6px 6px", color: ep.revertedBelow100 ? C.g : C.r }}>{ep.revertedBelow100 ? "YES" : "NO"}</td>
                  <td style={{ padding: "6px 6px", color: C.g }}>{((ep.cumulativeFundingHold || ep.cumulativeFunding7d) * 100).toFixed(4)}%</td>
                  <td style={{ padding: "6px 6px", color: C.txM }}>{fmtPrice(ep.priceAtEntry)}</td>
                  <td style={{ padding: "6px 6px", color: C.txM }}>{fmtPrice(ep.priceAtExit)}</td>
                  <td style={{ padding: "6px 6px", color: priceColor, fontWeight: 600 }}>{fmtPct(ep.pricePnlPct)}</td>
                  <td style={{ padding: "6px 6px", color: netColor, fontWeight: 700 }}>{fmtPct(ep.netReturn)}</td>
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

export default function BacktestView() {
  var bt = useBacktest();

  // Threshold slider labels
  var thresholdAPR = bt.threshold * 100; // display as %

  return (
    <div style={{ padding: "16px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 20, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700 }}>
          <span style={{ color: C.o }}>Funding Rate</span> Backtest
        </h2>
        <div style={{ fontSize: 11, color: C.txM }}>
          Analyze historical funding rate spikes with price impact over realistic hold periods
        </div>
      </div>

      {/* Controls */}
      <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 20, alignItems: "flex-end", flexWrap: "wrap" }}>
          {/* Threshold */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 10, color: C.txM, fontFamily: "monospace", marginBottom: 4, textTransform: "uppercase", fontWeight: 600 }}>
              APR Threshold: <span style={{ color: C.o }}>{thresholdAPR.toFixed(0)}%</span>
            </div>
            <input
              type="range" min={1} max={50} step={0.5}
              value={bt.threshold}
              onChange={function(e) { bt.setThreshold(parseFloat(e.target.value)); }}
              style={{ width: "100%", accentColor: C.o }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: C.txD }}>
              <span>100%</span><span>1000%</span><span>2500%</span><span>5000%</span>
            </div>
          </div>

          {/* Lookback */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 10, color: C.txM, fontFamily: "monospace", marginBottom: 4, textTransform: "uppercase", fontWeight: 600 }}>
              Lookback: <span style={{ color: C.a }}>{bt.lookback} days</span>
            </div>
            <input
              type="range" min={7} max={90} step={1}
              value={bt.lookback}
              onChange={function(e) { bt.setLookback(parseInt(e.target.value)); }}
              style={{ width: "100%", accentColor: C.a }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: C.txD }}>
              <span>7d</span><span>30d</span><span>60d</span><span>90d</span>
            </div>
          </div>

          {/* Run Button */}
          <button
            onClick={bt.run}
            disabled={bt.loading}
            style={{
              padding: "12px 28px", borderRadius: 8, border: "1px solid " + C.o + "50",
              background: "linear-gradient(135deg," + C.o + "20," + C.y + "10)",
              color: C.o, fontFamily: "monospace", fontSize: 13, fontWeight: 700,
              cursor: bt.loading ? "wait" : "pointer", whiteSpace: "nowrap",
            }}
          >
            {bt.loading ? "\u27F3 Running..." : "\u25B6 Run Backtest"}
          </button>
        </div>

        {bt.elapsed && (
          <div style={{ fontSize: 9, color: C.txD, marginTop: 8 }}>Completed in {bt.elapsed}</div>
        )}
      </div>

      {/* Error */}
      {bt.error && (
        <div style={{ padding: "12px 16px", borderRadius: 8, background: C.r + "15", border: "1px solid " + C.r + "40", color: C.r, fontSize: 11, marginBottom: 14 }}>
          Error: {bt.error}
        </div>
      )}

      {/* Loading */}
      {bt.loading && (
        <div style={{ textAlign: "center", padding: 60, color: C.txD, fontSize: 12 }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>{"\u27F3"}</div>
          Fetching funding history and price data...<br />
          <span style={{ fontSize: 10, color: C.txD }}>This may take 30-60 seconds for top 20 tokens.</span>
        </div>
      )}

      {/* No data yet */}
      {!bt.data && !bt.loading && !bt.error && (
        <div style={{ textAlign: "center", padding: 60, color: C.txD, fontSize: 12 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>{"\uD83D\uDCCA"}</div>
          Adjust threshold and lookback period above, then click <span style={{ color: C.o, fontWeight: 700 }}>Run Backtest</span> to analyze historical funding rate spikes.
        </div>
      )}

      {/* Results */}
      {bt.data && !bt.loading && (
        <>
          <SummaryCards data={bt.data} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 0 }}>
            <DecayChart curve={bt.data.avgDecayCurve} />
            <DirectionBreakdown episodes={bt.data.episodes} />
          </div>

          <TokenTable summaries={bt.data.tokenSummaries} />
          <EpisodeTimeline episodes={bt.data.episodes} />
          <NetReturnDistribution episodes={bt.data.episodes} />
          <EpisodeTable episodes={bt.data.episodes} />

          {/* Strategy insight */}
          {bt.data.totalEpisodes > 0 && (function() {
            var sNetR = bt.data.avgNetReturn || 0;
            var sHoldH = bt.data.avgHoldHours || 0;
            var sFundH = bt.data.avgFundingHold || 0;
            var sPriceP = bt.data.avgPricePnl || 0;
            return (
            <div style={{ background: (sNetR >= 0 ? C.g : C.r) + "08", border: "1px solid " + (sNetR >= 0 ? C.g : C.r) + "25", borderRadius: 10, padding: 16, marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: sNetR >= 0 ? C.g : C.r, marginBottom: 6 }}>{"\uD83D\uDCA1"} Strategy Insight</div>
              <div style={{ fontSize: 11, color: C.txM, lineHeight: 1.7 }}>
                {sNetR >= 0 ? (
                  <span>
                    Average <strong style={{ color: C.g }}>net return</strong> (funding + price) over a{" "}
                    <strong style={{ color: C.o }}>{sHoldH.toFixed(1)}h</strong> avg hold is{" "}
                    <strong style={{ color: C.g }}>{(sNetR * 100).toFixed(4)}%</strong> per $1 notional.
                    {" "}Funding earned <strong style={{ color: C.g }}>{(sFundH * 100).toFixed(4)}%</strong>,
                    price impact averaged <strong style={{ color: sPriceP >= 0 ? C.g : C.r }}>{(sPriceP * 100).toFixed(4)}%</strong>.
                    {bt.data.revertPct > 60 && (
                      <span>
                        {" "}<strong style={{ color: C.g }}>{bt.data.revertPct.toFixed(0)}%</strong> of episodes reverted below 100% APR
                        (avg revert: <strong style={{ color: C.o }}>{bt.data.avgRevertHours.toFixed(1)}h</strong>).
                        {" "}Funding spikes appear <strong style={{ color: C.a }}>mean-reverting</strong> and historically profitable after price impact.
                      </span>
                    )}
                  </span>
                ) : (
                  <span>
                    Average <strong style={{ color: C.r }}>net return is negative</strong> at{" "}
                    <strong style={{ color: C.r }}>{(sNetR * 100).toFixed(4)}%</strong> over a{" "}
                    <strong style={{ color: C.o }}>{sHoldH.toFixed(1)}h</strong> avg hold.
                    {" "}While funding earned <strong style={{ color: C.g }}>{(sFundH * 100).toFixed(4)}%</strong>,
                    price impact of <strong style={{ color: C.r }}>{(sPriceP * 100).toFixed(4)}%</strong> wiped out gains.
                    {" "}Consider <strong style={{ color: C.o }}>delta-neutral hedging</strong> (spot + perp) or tighter stop-losses to protect against adverse price moves.
                  </span>
                )}
              </div>
            </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
