import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  ComposedChart, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Area, AreaChart, BarChart, Bar, Cell, ReferenceLine, CartesianGrid, Brush, ReferenceArea
} from "recharts";

const MASCOT = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAwADADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwC9Z2wVRxU8t5aWwZXmiMijPl7wGPtQ8Ya3bc8ioFJYIcEj0z1/KuI1KE210Y2CCTqyKMBc9vU49T1NeZb2sm2zsqVHBaI2p/E8xmHkQoiAdHO4mmWviBlup5ZcSB8Hyw2NrYwMVi2Vq9zKHKFot6hjg8D60/UbBEleSCN0iBwjZyM/XrWqoRbsZr2rXMddpOoPqSSF4o02HHytz+VLfWwZTxXG+HtWksb1GnyYiTHJjk49fwNd9LtePIIIIyCO9ZSjKjM1pT5lruGT5J2AFv4Qeme1edam0iyzsXMjtIwZz1J5yf0r0K3kyorD1fQ2ls5zBEC6zNMpHVgcZH4U6TUJWZNaDlawukiJNIs7do2Z5VO5hIF8o9vl6tmk1WW1W3+xiEiRIwTL5nV88rt9PeoPtGbWNLfYs8cY2S4GVA7dKzvNlfc1wQ8hP3j1FddKLcrs1krRtcyIv3d+6kY+bIwcZ5zXpccfkwCMMSq/dz1A7CuZtPD6X8Ynd2ibYw6fxZ+U/TFdG0hFuu/htoB+veufESU5WiZUouLZStZ8Ac1oxzAjrXPQS8Cri3OxCxPAFdOIw2tzcn1LTbWeGR4owlxtJVlOMn3rN0aPTXaJJixvFyWSUEDPoB0qzb6i7ruYYB5A9u1Vr25Wa5hyAXDZDDrxk1yQlP4Hc5HVfMdA8oArPuZsgjNRfafMjDA9RVWaXiuqhhrO51n/2Q==";

const C = {
  bg: "#06090f", s: "#0d1117", sL: "#151d2b",
  b: "#1b2436", bL: "#2a3a54",
  tx: "#f0f4fc", txM: "#a8b8d8", txD: "#7889a8",
  a: "#00e5ff", aD: "#007a8a", g: "#00e676", r: "#ff3d5a",
  o: "#ffab00", p: "#b388ff", pk: "#ff80ab", y: "#fdd835",
};

function InfoTip({ text, children, pos }) {
  var p = pos || "top";
  var _s = useState(false), show = _s[0], setShow = _s[1];
  var ps = { top: { bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" }, right: { left: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" }, bottom: { top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" }, left: { right: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" } };
  return (<span style={{ position: "relative", display: "inline-flex", alignItems: "center" }} onMouseEnter={function(){ setShow(true); }} onMouseLeave={function(){ setShow(false); }}>{children}{show && <div style={{ position: "absolute", ...(ps[p]), zIndex: 9999, width: 260, padding: "10px 12px", background: "#1a2540", border: "1px solid " + C.bL, borderRadius: 8, boxShadow: "0 12px 40px rgba(0,0,0,.7)", fontSize: 11, color: C.txM, lineHeight: 1.5, fontFamily: "sans-serif", pointerEvents: "none" }}>{text}</div>}</span>);
}
function HelpDot({ text, pos }) { return (<InfoTip text={text} pos={pos || "right"}><span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, borderRadius: "50%", background: C.a + "18", color: C.a, fontSize: 8, fontWeight: 700, cursor: "help", marginLeft: 4, flexShrink: 0 }}>?</span></InfoTip>); }

function genH(base, vol) { var h = [], p = base; for (var i = 0; i < 168; i++) { p += (Math.random() - 0.48) * vol; p = Math.max(base * 0.6, Math.min(base * 1.6, p)); h.push({ t: i, price: +(p.toFixed(4)) }); } return h; }
function genO(base, vol) { var h = [], p = base; for (var i = 0; i < 168; i++) { p += (Math.random() - 0.5) * vol; p = Math.max(5, Math.min(95, p)); h.push({ t: i, odds: +(p.toFixed(1)) }); } return h; }

var SEED = [
  { sym: "BTC", name: "Bitcoin", cat: "Crypto / L1", pr: 71200, vl: 800, bets: [
    { id: "btc1", q: "Bitcoin above $80,000 in February 2026?", od: 17, v: 3, th: 80000, url: "polymarket.com/crypto/bitcoin" },
    { id: "btc2", q: "Bitcoin above $100,000 in 2026?", od: 55, v: 4, th: 100000, url: "polymarket.com/event/what-price-will-bitcoin-hit-before-2027" },
    { id: "btc3", q: "Bitcoin below $60,000 in February 2026?", od: 38, v: 3.5, th: 60000, url: "polymarket.com/crypto/bitcoin" }
  ] },
  { sym: "ETH", name: "Ethereum", cat: "Crypto / L1", pr: 2090, vl: 35, bets: [
    { id: "eth1", q: "Ethereum above $3,000 by March 31, 2026?", od: 6, v: 2, th: 3000, url: "polymarket.com/crypto" },
    { id: "eth2", q: "Ethereum above $2,500 in 2026?", od: 42, v: 3, th: 2500, url: "polymarket.com/crypto" },
    { id: "eth3", q: "Fed 25 bps rate cut by March 2026 FOMC?", od: 28, v: 2.5, th: null, url: "polymarket.com" }
  ] },
  { sym: "SOL", name: "Solana", cat: "Crypto / L1", pr: 84.5, vl: 3.5, bets: [
    { id: "sol1", q: "Solana above $120 in 2026?", od: 35, v: 3, th: 120, url: "polymarket.com/predictions/solana" },
    { id: "sol2", q: "Solana above $100 by March 2026?", od: 12, v: 2, th: 100, url: "polymarket.com/predictions/solana" },
    { id: "sol3", q: "Solana all-time high by June 2026?", od: 8, v: 1.8, th: 294, url: "polymarket.com/predictions/solana" }
  ] },
  { sym: "TRUMP", name: "Trump Media", cat: "Politics / Crypto", pr: 34, vl: 1.2, bets: [
    { id: "t1", q: "Trump launches new cryptocurrency by end of 2026?", od: 27, v: 2.5, th: null, url: "polymarket.com" },
    { id: "t2", q: "Trump approval above 50% in February?", od: 35, v: 2.2, th: null, url: "polymarket.com/predictions/trump" },
    { id: "t3", q: "US government shutdown in 2026?", od: 65, v: 2.8, th: null, url: "polymarket.com" }
  ] },
  { sym: "OPENAI", name: "OpenAI", cat: "AI / Tech", pr: 715, vl: 8, bets: [
    { id: "oa1", q: "OpenAI IPO by December 31, 2026?", od: 52, v: 2.5, th: null, url: "polymarket.com/event/openai-ipo-by" },
    { id: "oa2", q: "OpenAI $1T+ IPO before 2027?", od: 20, v: 2, th: null, url: "polymarket.com/event/openai-1t-valuation-in-2026" },
    { id: "oa3", q: "Which company has best AI model end of March? (OpenAI)", od: 48, v: 2.3, th: null, url: "polymarket.com/predictions/ai" }
  ] },
  { sym: "XRP", name: "XRP", cat: "Crypto / Payments", pr: 1.32, vl: 0.08, bets: [
    { id: "xrp1", q: "XRP above $2.00 by March 2026?", od: 15, v: 2.5, th: 2.0, url: "polymarket.com/crypto" },
    { id: "xrp2", q: "XRP all-time high by June 2026?", od: 7, v: 1.5, th: 3.84, url: "polymarket.com/crypto" }
  ] },
  { sym: "HYPE", name: "Hyperliquid", cat: "DeFi / L1", pr: 22, vl: 0.8, bets: [
    { id: "h1", q: "Bitcoin above $100,000 in 2026?", od: 55, v: 4, th: 100000, url: "polymarket.com/event/what-price-will-bitcoin-hit-before-2027" },
    { id: "h2", q: "Ethereum above $3,000 in 2026?", od: 28, v: 2, th: 3000, url: "polymarket.com/crypto" }
  ] },
  { sym: "DOGE", name: "Dogecoin", cat: "Meme / Crypto", pr: 0.14, vl: 0.008, bets: [
    { id: "doge1", q: "Dogecoin above $0.25 by March 2026?", od: 10, v: 2, th: 0.25, url: "polymarket.com/crypto" },
    { id: "doge2", q: "Trump launches new cryptocurrency by end of 2026?", od: 27, v: 2.5, th: null, url: "polymarket.com" }
  ] },
  { sym: "MSTR", name: "MicroStrategy", cat: "BTC Treasury", pr: 185, vl: 12, bets: [
    { id: "ms1", q: "Bitcoin above $85,000 by February 28, 2026?", od: 9, v: 2.5, th: 85000, url: "polymarket.com/crypto/bitcoin" },
    { id: "ms2", q: "Bitcoin above $100,000 in 2026?", od: 55, v: 4, th: 100000, url: "polymarket.com/event/what-price-will-bitcoin-hit-before-2027" },
    { id: "ms3", q: "MicroStrategy: Nothing Ever Happens", od: 62, v: 2, th: null, url: "polymarket.com/predictions/bitcoin" }
  ] },
  { sym: "LINK", name: "Chainlink", cat: "Oracle / DeFi", pr: 10.5, vl: 0.6, bets: [
    { id: "lnk1", q: "Bitcoin above $80,000 in February 2026?", od: 17, v: 3, th: 80000, url: "polymarket.com/crypto/bitcoin" },
    { id: "lnk2", q: "Fed rate cut before June 2026?", od: 45, v: 2, th: null, url: "polymarket.com" }
  ] },
];

function initAssets() { return SEED.map(function(a) { return { ...a, priceHistory: genH(a.pr, a.vl), bets: a.bets.map(function(b) { return { ...b, currentOdds: b.od, oddsHistory: genO(b.od, b.v) }; }) }; }); }

function pearson(x, y) { var n = Math.min(x.length, y.length); if (n < 3) return 0; var mx = x.reduce(function(a, b) { return a + b; }, 0) / n; var my = y.reduce(function(a, b) { return a + b; }, 0) / n; var num = 0, dx = 0, dy = 0; for (var i = 0; i < n; i++) { var xi = x[i] - mx, yi = y[i] - my; num += xi * yi; dx += xi * xi; dy += yi * yi; } var d = Math.sqrt(dx * dy); return d === 0 ? 0 : +(num / d).toFixed(3); }
function compCorr(asset) { var pD = asset.priceHistory.slice(1).map(function(p, i) { return p.price - asset.priceHistory[i].price; }); return asset.bets.map(function(b) { var oD = b.oddsHistory.slice(1).map(function(o, i) { return o.odds - b.oddsHistory[i].odds; }); return { betId: b.id, question: b.q, correlation: pearson(pD, oD) }; }); }

function MySlider({ label, value, onChange, min, max, step, unit, tip }) {
  var pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (<div style={{ marginBottom: 12 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}><div style={{ display: "flex", alignItems: "center" }}><label style={{ fontSize: 11, color: C.tx, fontFamily: "monospace", letterSpacing: ".04em", textTransform: "uppercase" }}>{label}</label>{tip && <HelpDot text={tip} />}</div><span style={{ fontSize: 14, color: C.a, fontFamily: "monospace", fontWeight: 700 }}>{unit === "$" ? "$" + value.toLocaleString() : unit === "x" ? value + "x" : "$" + value}</span></div><div style={{ position: "relative", height: 4, borderRadius: 2, background: C.b }}><div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: pct + "%", borderRadius: 2, background: "linear-gradient(90deg," + C.aD + "," + C.a + ")" }} /></div><input type="range" min={min} max={max} step={step} value={value} onChange={function(e) { onChange(Number(e.target.value)); }} style={{ width: "100%", marginTop: -4, appearance: "none", WebkitAppearance: "none", background: "transparent", cursor: "pointer", height: 16 }} /></div>);
}

function Toggle({ options, value, onChange, colors, tip }) {
  return (<div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ display: "flex", flex: 1, borderRadius: 7, overflow: "hidden", border: "1px solid " + C.b }}>{options.map(function(o, i) { var on = value === o.value; var col = (colors && colors[o.value]) || C.a; return (<button key={o.value} onClick={function() { onChange(o.value); }} style={{ flex: 1, padding: "7px 8px", border: "none", cursor: "pointer", fontSize: 11, fontWeight: on ? 700 : 500, background: on ? col + "20" : C.sL, color: on ? col : C.txD, fontFamily: "monospace", borderRight: i < options.length - 1 ? "1px solid " + C.b : "none", boxShadow: on ? "inset 0 -2px 0 " + col : "none", transition: "all .15s" }}>{o.icon && <span style={{ marginRight: 3 }}>{o.icon}</span>}{o.label}</button>); })}</div>{tip && <HelpDot text={tip} />}</div>);
}

function ChartTip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  var d = payload[0] && payload[0].payload ? payload[0].payload : {};
  return (<div style={{ background: C.s, border: "1px solid " + C.bL, borderRadius: 8, padding: "8px 12px", boxShadow: "0 8px 32px rgba(0,0,0,.6)", fontFamily: "monospace", fontSize: 11, maxWidth: 280, zIndex: 999 }}><div style={{ color: C.txD, marginBottom: 4 }}>Price: ${label}</div>{d.isLiq && <div style={{ color: "#ff6090", fontWeight: 700, marginBottom: 2 }}>⚠ LIQUIDATED</div>}{payload.filter(function(p) { return p.dataKey !== "pos" && p.dataKey !== "neg" && p.dataKey !== "varRed" && p.dataKey !== "varGreen"; }).map(function(p, i) { return (<div key={i} style={{ color: p.color || (typeof p.value === "number" && p.value >= 0 ? C.g : C.r), marginBottom: 2 }}>{p.name}: {typeof p.value === "number" ? (p.value >= 0 ? "+" : "") + p.value.toFixed(2) : p.value}</div>); })}</div>);
}

function MetricCard({ label, value, color, icon, tip }) {
  return (<InfoTip text={tip} pos="bottom"><div style={{ background: C.sL, border: "1px solid " + C.b, borderRadius: 9, padding: "10px 12px", minWidth: 115, cursor: "help" }}><div style={{ fontSize: 9, color: C.txD, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 4 }}>{icon} {label}</div><div style={{ fontSize: 16, color: color, fontFamily: "monospace", fontWeight: 700 }}>{value}</div></div></InfoTip>);
}

/* ═══ 3D Canvas Surface ═══ */
function Surface3D({ scenarios, leverage, collateral, entryPrice, dir, hedges, asset }) {
  var canvasRef = useRef(null);
  var angleRef = useRef(0.6);
  var pitchRef = useRef(0.45);
  var dragRef = useRef(false);
  var lxRef = useRef(0);
  var lyRef = useRef(0);

  useEffect(function() {
    var canvas = canvasRef.current;
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    var W = canvas.width, H = canvas.height;
    var dirM = dir === "long" ? 1 : -1;
    var levs = [1, 2, 3, 5, 7, 10, 15, 20];
    var pMin = scenarios[0] ? scenarios[0].valuation : entryPrice * 0.5;
    var pMax = scenarios[scenarios.length - 1] ? scenarios[scenarios.length - 1].valuation : entryPrice * 2;
    var cols = 22, rows = levs.length;
    var pStep = (pMax - pMin) / (cols - 1);
    var maxAbs = 1;
    var grid = [];
    for (var r = 0; r < rows; r++) {
      var row = [];
      for (var c = 0; c < cols; c++) {
        var val = pMin + c * pStep;
        var pl = dirM * levs[r] * ((val - entryPrice) / entryPrice) * collateral;
        var liqPr = dir === "long" ? entryPrice * (1 - 1 / levs[r]) : entryPrice * (1 + 1 / levs[r]);
        var isLiq = dir === "long" ? val <= liqPr : val >= liqPr;
        if (isLiq) pl = -collateral;
        pl = Math.max(-collateral, pl);
        for (var hi = 0; hi < hedges.length; hi++) {
          var h = hedges[hi];
          var bet = asset.bets.find(function(b) { return b.id === h.betId; });
          if (!bet || h.size <= 0) continue;
          var st = bet.th !== null ? entryPrice * (bet.th / asset.pr) : entryPrice * (h.side === "yes" ? 1.1 : 0.9);
          var wins = h.side === "no" ? val <= st : val > st;
          var od = bet.currentOdds;
          var profit = h.side === "yes" ? h.size * (100 - od) / od : h.size * od / (100 - od);
          pl += wins ? profit : -h.size;
        }
        row.push(pl);
        if (Math.abs(pl) > maxAbs) maxAbs = Math.abs(pl);
      }
      grid.push(row);
    }

    var animId;
    function project(x, y, z, yaw, pitch) {
      var cy = Math.cos(yaw), sy = Math.sin(yaw);
      var cp = Math.cos(pitch), sp = Math.sin(pitch);
      var rx = x * cy - z * sy;
      var rz1 = x * sy + z * cy;
      var ry = y * cp - rz1 * sp;
      var rz = y * sp + rz1 * cp;
      var scale = 220 / (220 + rz * 35);
      return { px: W / 2 + rx * scale * 100, py: H / 2 - ry * scale * 70, depth: rz };
    }

    function draw() {
      var yaw = angleRef.current;
      var pitch = pitchRef.current;
      pitch = Math.max(-1.2, Math.min(1.2, pitch));
      pitchRef.current = pitch;
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, W, H);

      var faces = [];
      for (var ri = 0; ri < rows - 1; ri++) {
        for (var ci = 0; ci < cols - 1; ci++) {
          var yScale = 1.6;
          var pts = [
            [ci / (cols - 1) - 0.5, grid[ri][ci] / maxAbs * yScale * 0.5, ri / (rows - 1) - 0.5],
            [(ci + 1) / (cols - 1) - 0.5, grid[ri][ci + 1] / maxAbs * yScale * 0.5, ri / (rows - 1) - 0.5],
            [(ci + 1) / (cols - 1) - 0.5, grid[ri + 1][ci + 1] / maxAbs * yScale * 0.5, (ri + 1) / (rows - 1) - 0.5],
            [ci / (cols - 1) - 0.5, grid[ri + 1][ci] / maxAbs * yScale * 0.5, (ri + 1) / (rows - 1) - 0.5]
          ];
          var projected = pts.map(function(p) { return project(p[0] * 3, p[1] * 2, p[2] * 3, yaw, pitch); });
          var avgD = (projected[0].depth + projected[1].depth + projected[2].depth + projected[3].depth) / 4;
          var avgPL = (grid[ri][ci] + grid[ri][ci + 1] + grid[ri + 1][ci] + grid[ri + 1][ci + 1]) / 4;
          var norm = avgPL / maxAbs;
          var fc;
          if (norm > 0) { var gv = Math.floor(60 + norm * 195); fc = "rgba(0," + gv + ",60,0.9)"; }
          else { var rv = Math.floor(60 + Math.abs(norm) * 195); fc = "rgba(" + rv + ",15,40,0.9)"; }
          faces.push({ projected: projected, fillColor: fc, avgDepth: avgD });
        }
      }
      faces.sort(function(a, b) { return b.avgDepth - a.avgDepth; });
      for (var fi = 0; fi < faces.length; fi++) {
        var face = faces[fi];
        ctx.beginPath();
        ctx.moveTo(face.projected[0].px, face.projected[0].py);
        ctx.lineTo(face.projected[1].px, face.projected[1].py);
        ctx.lineTo(face.projected[2].px, face.projected[2].py);
        ctx.lineTo(face.projected[3].px, face.projected[3].py);
        ctx.closePath();
        ctx.fillStyle = face.fillColor;
        ctx.fill();
        ctx.strokeStyle = "rgba(42,58,84,0.3)";
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Zero plane
      ctx.strokeStyle = "rgba(120,140,170,0.25)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      var za = project(-1.5, 0, -1.5, yaw, pitch), zb = project(1.5, 0, -1.5, yaw, pitch), zc = project(1.5, 0, 1.5, yaw, pitch), zd = project(-1.5, 0, 1.5, yaw, pitch);
      ctx.beginPath(); ctx.moveTo(za.px, za.py); ctx.lineTo(zb.px, zb.py); ctx.lineTo(zc.px, zc.py); ctx.lineTo(zd.px, zd.py); ctx.closePath(); ctx.stroke();
      ctx.setLineDash([]);

      // Axis values
      ctx.font = "bold 11px monospace";
      ctx.fillStyle = "#00e5ff";
      var pLabels = [0, 0.25, 0.5, 0.75, 1];
      for (var pi = 0; pi < pLabels.length; pi++) {
        var pv = pMin + (pMax - pMin) * pLabels[pi];
        var pp = project((pLabels[pi] - 0.5) * 3, -1.4, -1.7, yaw, pitch);
        ctx.fillText("$" + pv.toFixed(pv > 10 ? 0 : 2), pp.px - 15, pp.py);
      }
      ctx.fillStyle = "#b388ff";
      var levLabels = [0, 2, 4, 7];
      for (var li = 0; li < levLabels.length; li++) {
        var idx = levLabels[li];
        if (idx < levs.length) {
          var lp = project(1.7, -1.4, (idx / (rows - 1) - 0.5) * 3, yaw, pitch);
          ctx.fillText(levs[idx] + "x", lp.px, lp.py);
        }
      }
      ctx.fillStyle = "#00e676";
      var plVals = [-maxAbs, -maxAbs * 0.5, 0, maxAbs * 0.5, maxAbs];
      for (var yi = 0; yi < plVals.length; yi++) {
        var yp = project(-1.8, plVals[yi] / maxAbs * 1.6, -1.7, yaw, pitch);
        ctx.fillText("$" + plVals[yi].toFixed(0), yp.px - 25, yp.py);
      }

      // Axis labels
      ctx.font = "bold 12px monospace";
      ctx.fillStyle = "#00e5ff";
      var lbl1 = project(0, -1.8, -2, yaw, pitch);
      ctx.fillText("Price →", lbl1.px - 20, lbl1.py);
      ctx.fillStyle = "#b388ff";
      var lbl2 = project(2, -1.8, 0, yaw, pitch);
      ctx.fillText("Leverage →", lbl2.px - 25, lbl2.py);
      ctx.fillStyle = "#00e676";
      var lbl3 = project(-2, 0.8, -2, yaw, pitch);
      ctx.fillText("Net P/L ↑", lbl3.px - 20, lbl3.py);

      if (!dragRef.current) angleRef.current += 0.003;
      animId = requestAnimationFrame(draw);
    }
    draw();

    var onDown = function(e) { dragRef.current = true; lxRef.current = (e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0)); lyRef.current = (e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0)); };
    var onUp = function() { dragRef.current = false; };
    var onMove = function(e) { if (!dragRef.current) return; var cx = (e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0)); var cy = (e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0)); angleRef.current += (cx - lxRef.current) * 0.008; pitchRef.current += (cy - lyRef.current) * 0.005; lxRef.current = cx; lyRef.current = cy; };
    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("touchstart", onDown);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("touchmove", onMove);

    return function() {
      cancelAnimationFrame(animId);
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("touchstart", onDown);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("touchmove", onMove);
    };
  }, [scenarios, leverage, collateral, entryPrice, dir, hedges, asset]);

  return <canvas ref={canvasRef} width={750} height={400} style={{ width: "100%", height: 400, borderRadius: 8, cursor: "grab" }} />;
}

/* ═══ Splash ═══ */
function Splash({ onClose }) {
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

/* ═══════════ MAIN ═══════════ */
export default function App() {
  var _a = useState(initAssets), assets = _a[0];
  var _b = useState(0), selIdx = _b[0], setSelIdx = _b[1];
  var _c = useState(true), showSplash = _c[0], setShowSplash = _c[1];
  var _d = useState(false), dropOpen = _d[0], setDropOpen = _d[1];
  var asset = assets[selIdx];
  var _e = useState("long"), dir = _e[0], setDir = _e[1];
  var _f = useState(1000), collateral = _f[0], setCollateral = _f[1];
  var _g = useState(3), leverage = _g[0], setLeverage = _g[1];
  var _h = useState(asset.pr), entryPrice = _h[0], setEntryPrice = _h[1];
  var _i = useState(0), minVal = _i[0], setMinVal = _i[1];
  var _j = useState(+(asset.pr * 2.5).toFixed(4)), maxVal = _j[0], setMaxVal = _j[1];
  var _k = useState([]), hedges = _k[0], setHedges = _k[1];
  var _l = useState(false), optimizing = _l[0], setOptimizing = _l[1];
  var _m = useState(null), optimResult = _m[0], setOptimResult = _m[1];
  var _n = useState("7d"), varPeriod = _n[0], setVarPeriod = _n[1];

  useEffect(function() {
    var a = assets[selIdx];
    setEntryPrice(a.pr); setMinVal(0); setMaxVal(+(a.pr * 2.5).toFixed(4));
    setHedges([]); setOptimResult(null);
  }, [selIdx, assets]);

  var addHedge = function(id) { if (!hedges.find(function(h) { return h.betId === id; })) setHedges(function(p) { return p.concat([{ betId: id, side: "no", size: 50 }]); }); };
  var rmHedge = function(id) { setHedges(function(p) { return p.filter(function(h) { return h.betId !== id; }); }); };
  var updHedge = function(id, f, v) { setHedges(function(p) { return p.map(function(h) { if (h.betId === id) { var n = {}; for (var k in h) n[k] = h[k]; n[f] = v; return n; } return h; }); }); };

  // Price variance from simulated history
  var priceVar = useMemo(function() {
    var hours = varPeriod === "1d" ? 24 : varPeriod === "3d" ? 72 : varPeriod === "7d" ? 168 : varPeriod === "14d" ? 168 : 168;
    var start = Math.max(0, asset.priceHistory.length - hours);
    var slice = asset.priceHistory.slice(start);
    if (slice.length < 2) return { low: asset.pr * 0.95, high: asset.pr * 1.05, avg: asset.pr, vol: 0 };
    var prices = slice.map(function(p) { return p.price; });
    var lo = Math.min.apply(null, prices);
    var hi = Math.max.apply(null, prices);
    var avg = prices.reduce(function(a, b) { return a + b; }, 0) / prices.length;
    // For 14d and 30d, scale up
    if (varPeriod === "14d") { var range = hi - lo; lo = lo - range * 0.5; hi = hi + range * 0.5; }
    if (varPeriod === "30d") { var range2 = hi - lo; lo = lo - range2 * 1.2; hi = hi + range2 * 1.2; }
    return { low: Math.max(0, lo), high: hi, avg: avg };
  }, [asset, varPeriod]);

  // Liquidation price
  var liqPrice = useMemo(function() {
    if (leverage <= 1) return dir === "long" ? 0 : entryPrice * 100;
    if (dir === "long") return +(entryPrice * (1 - 1 / leverage)).toFixed(4);
    return +(entryPrice * (1 + 1 / leverage)).toFixed(4);
  }, [entryPrice, leverage, dir]);

  var scenarios = useMemo(function() {
    var eMin = Math.min(minVal, entryPrice), eMax = Math.max(maxVal, entryPrice);
    var pts = 100, step = (eMax - eMin) / (pts - 1), dirM = dir === "long" ? 1 : -1, data = [];
    for (var i = 0; i < pts; i++) {
      var val = +(eMin + step * i).toFixed(4);
      // Perp P/L with liquidation: once liq price is hit, position is closed at -collateral
      var isLiquidated = dir === "long" ? val <= liqPrice : val >= liqPrice;
      var perp = isLiquidated ? -collateral : dirM * leverage * ((val - entryPrice) / entryPrice) * collateral;
      perp = Math.max(-collateral, perp); // safety clamp
      var hPL = 0;
      for (var hi2 = 0; hi2 < hedges.length; hi2++) {
        var h = hedges[hi2];
        var bet = asset.bets.find(function(b) { return b.id === h.betId; });
        if (!bet || h.size <= 0) continue;
        var st = bet.th !== null ? entryPrice * (bet.th / asset.pr) : entryPrice * (h.side === "yes" ? 1.1 : 0.9);
        var wins = h.side === "no" ? val <= st : val > st;
        var od2 = bet.currentOdds;
        var profit2 = h.side === "yes" ? h.size * (100 - od2) / od2 : h.size * od2 / (100 - od2);
        hPL += wins ? profit2 : -h.size;
      }
      var net = perp + hPL;
      var vRounded = +val.toFixed(2);
      var inVarRange = vRounded >= +priceVar.low.toFixed(2) && vRounded <= +priceVar.high.toFixed(2);
      var belowEntry = vRounded < +entryPrice.toFixed(2);
      data.push({
        valuation: vRounded,
        perpPL: +perp.toFixed(2),
        hedgePL: +hPL.toFixed(2),
        netPL: +net.toFixed(2),
        isLiq: isLiquidated,
        pos: Math.max(0, net),
        neg: Math.min(0, net),
        varRed: (inVarRange && belowEntry) ? net : null,
        varGreen: (inVarRange && !belowEntry) ? net : null
      });
    }
    return data;
  }, [collateral, leverage, entryPrice, minVal, maxVal, dir, hedges, asset, liqPrice, priceVar]);

  var risk = useMemo(function() {
    var pls = scenarios.map(function(s) { return s.netPL; });
    var mean = pls.reduce(function(a, b) { return a + b; }, 0) / pls.length;
    var v = pls.reduce(function(a, b) { return a + Math.pow(b - mean, 2); }, 0) / pls.length;
    var hCost = hedges.reduce(function(s, h) { return s + h.size; }, 0);
    var denom = leverage * (collateral / entryPrice);
    var dirM = dir === "long" ? 1 : -1;
    var be = denom > 0 ? +(entryPrice + dirM * (hCost / denom)).toFixed(4) : entryPrice;
    return { breakeven: be, worst: Math.min.apply(null, pls), best: Math.max.apply(null, pls), vol: +Math.sqrt(v).toFixed(2), mean: +mean.toFixed(2), liqPrice: liqPrice };
  }, [scenarios, collateral, leverage, entryPrice, dir, hedges, liqPrice]);

  var correlations = useMemo(function() { return compCorr(asset); }, [asset]);

  var runOpt = useCallback(function() {
    setOptimizing(true); setOptimResult(null);
    setTimeout(function() {
      var bScore = -Infinity, bCfg = [], bMetrics = {};
      var sides = ["yes", "no"], sizes = [0, 25, 50, 100, 150, 200];
      var combos = [[]];
      for (var bi = 0; bi < asset.bets.length; bi++) {
        var bet = asset.bets[bi]; var nc = [];
        for (var ci = 0; ci < combos.length; ci++) {
          nc.push(combos[ci].slice());
          for (var si = 0; si < sides.length; si++) for (var zi = 0; zi < sizes.length; zi++) { if (sizes[zi] === 0) continue; nc.push(combos[ci].concat([{ betId: bet.id, side: sides[si], size: sizes[zi] }])); }
        }
        combos = nc.slice(0, 3000);
      }
      var eMin = Math.min(minVal, entryPrice), eMax = Math.max(maxVal, entryPrice), dirM = dir === "long" ? 1 : -1;
      var sP = 20, sS = (eMax - eMin) / (sP - 1);
      // Also compute no-hedge baseline
      var basePls = [];
      var liqP = dir === "long" ? entryPrice * (1 - 1 / leverage) : entryPrice * (1 + 1 / leverage);
      for (var ib = 0; ib < sP; ib++) { var vb = eMin + sS * ib; var isLiq = dir === "long" ? vb <= liqP : vb >= liqP; basePls.push(isLiq ? -collateral : Math.max(-collateral, dirM * leverage * ((vb - entryPrice) / entryPrice) * collateral)); }
      var baseMean = basePls.reduce(function(a,b){return a+b;},0) / sP;
      var baseWorst = Math.min.apply(null, basePls);

      for (var ci2 = 0; ci2 < combos.length; ci2++) {
        var cfg = combos[ci2]; var pls = [];
        for (var i = 0; i < sP; i++) {
          var val = eMin + sS * i;
          var pl = (dir === "long" ? val <= liqP : val >= liqP) ? -collateral : Math.max(-collateral, dirM * leverage * ((val - entryPrice) / entryPrice) * collateral);
          for (var hi2 = 0; hi2 < cfg.length; hi2++) {
            var h = cfg[hi2]; var bt = asset.bets.find(function(b) { return b.id === h.betId; }); if (!bt) continue;
            var st = bt.th !== null ? entryPrice * (bt.th / asset.pr) : entryPrice * (h.side === "yes" ? 1.1 : 0.9);
            var bWins = h.side === "no" ? val <= st : val > st;
            var bOd = bt.currentOdds;
            var bProfit = h.side === "yes" ? h.size * (100 - bOd) / bOd : h.size * bOd / (100 - bOd);
            pl += bWins ? bProfit : -h.size;
          }
          pls.push(pl);
        }
        var mn = pls.reduce(function(a, b) { return a + b; }, 0) / pls.length;
        var wst = Math.min.apply(null, pls);
        var bst = Math.max.apply(null, pls);
        var cost = cfg.reduce(function(s, h) { return s + h.size; }, 0);
        var sc = mn * 1.0 + wst * 0.8 + bst * 0.15 - cost * 0.05;
        if (sc > bScore) { bScore = sc; bCfg = cfg; bMetrics = { mean: +mn.toFixed(2), worst: +wst.toFixed(2), best: +bst.toFixed(2), cost: cost, worstImprove: +(wst - baseWorst).toFixed(2), meanChange: +(mn - baseMean).toFixed(2) }; }
      }
      setHedges(bCfg);
      setOptimResult({ config: bCfg, score: +bScore.toFixed(2), metrics: bMetrics, baseMean: +baseMean.toFixed(2), baseWorst: +baseWorst.toFixed(2) });
      setOptimizing(false);
    }, 100);
  }, [asset, collateral, leverage, entryPrice, minVal, maxVal, dir]);

  var dlCSV = useCallback(function() {
    var b = new Blob(["Valuation,PerpPL,HedgePL,NetPL\n" + scenarios.map(function(s) { return s.valuation + "," + s.perpPL + "," + s.hedgePL + "," + s.netPL; }).join("\n")], { type: "text/csv" });
    var u = URL.createObjectURL(b); var a = document.createElement("a"); a.href = u; a.download = "trade_scenarios.csv"; a.click(); URL.revokeObjectURL(u);
  }, [scenarios]);

  var tableRows = useMemo(function() { var st = Math.max(1, Math.floor(scenarios.length / 20)); return scenarios.filter(function(_, i) { return i % st === 0 || i === scenarios.length - 1; }); }, [scenarios]);
  var histData = useMemo(function() { return asset.priceHistory.filter(function(_, i) { return i % 4 === 0; }).map(function(p, idx) { var r = { t: Math.floor((idx * 4) / 24) + "d", price: p.price }; asset.bets.forEach(function(b) { if (b.oddsHistory[idx * 4]) r[b.id] = b.oddsHistory[idx * 4].odds; }); return r; }); }, [asset]);
  var corrData = correlations.map(function(c) { return { name: c.question.length > 28 ? c.question.slice(0, 25) + "..." : c.question, corr: c.correlation }; });
  var betCols = [C.p, C.pk, C.y, "#4dd0e1", "#ff6e40"];
  var pStep = Math.max(0.001, +(asset.pr * 0.01).toFixed(4));

  var varPeriods = [{ v: "1d", l: "1 Day" }, { v: "3d", l: "3 Days" }, { v: "7d", l: "7 Days" }, { v: "14d", l: "14 Days" }, { v: "30d", l: "30 Days" }];

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

      {/* HEADER */}
      <div style={{ background: "linear-gradient(180deg," + C.sL + "," + C.bg + ")", borderBottom: "1px solid " + C.b, padding: "14px 24px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <img src={MASCOT} alt="" style={{ width: 34, height: 34, borderRadius: "50%", border: "2px solid " + C.a + "40" }} />
          <h1 style={{ margin: 0, fontSize: 17, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700 }}>DefiDummy's <span style={{ color: C.a }}>Hedge Deal</span> Sniffer</h1>
          <span style={{ fontSize: 9, color: C.y, background: C.y + "12", padding: "2px 7px", borderRadius: 4, fontWeight: 700 }}>v5.0</span>
          <div style={{ marginLeft: "auto" }}><InfoTip text="Reopen the welcome guide" pos="bottom"><button onClick={function() { setShowSplash(true); }} style={{ padding: "4px 10px", borderRadius: 5, border: "1px solid " + C.b, background: C.sL, color: C.txM, fontSize: 10, cursor: "pointer", fontFamily: "monospace" }}>📖 Guide</button></InfoTip></div>
        </div>
      </div>

      {/* ASSET DROPDOWN */}
      <div style={{ padding: "10px 24px 0", position: "relative", zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: C.tx, textTransform: "uppercase", fontWeight: 600 }}>Asset:</span>
          <HelpDot text="Select a Hyperliquid perpetual futures asset. Each is paired with real active Polymarket prediction bets for hedging simulation." />
          <div style={{ position: "relative" }}>
            <button onClick={function() { setDropOpen(function(o) { return !o; }); }} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid " + C.a + "50", background: C.a + "10", color: C.a, fontFamily: "monospace", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, minWidth: 220 }}>
              <span>{asset.sym}</span><span style={{ color: C.txM, fontWeight: 500, fontSize: 11 }}>{asset.name}</span><span style={{ color: C.tx, fontSize: 11 }}>${asset.pr}</span><span style={{ marginLeft: "auto", fontSize: 9 }}>{dropOpen ? "▲" : "▼"}</span>
            </button>
            {dropOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, width: 360, maxHeight: 380, overflowY: "auto", background: C.s, border: "1px solid " + C.bL, borderRadius: 10, boxShadow: "0 16px 48px rgba(0,0,0,.7)", zIndex: 200 }}>
                <div style={{ padding: "8px 12px 4px", fontSize: 9, color: C.txM, textTransform: "uppercase", borderBottom: "1px solid " + C.b }}>Hyperliquid Perps ({assets.length})</div>
                {assets.map(function(a, i) {
                  return (<button key={a.sym} onClick={function() { setSelIdx(i); setDropOpen(false); }} style={{ display: "flex", width: "100%", padding: "9px 12px", border: "none", borderBottom: "1px solid " + C.b + "08", background: selIdx === i ? C.a + "10" : "transparent", cursor: "pointer", alignItems: "center", gap: 10, textAlign: "left" }}>
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

      {/* MAIN GRID */}
      <div style={{ padding: "12px 24px", display: "grid", gridTemplateColumns: "310px 1fr", gap: 14, alignItems: "start" }}>
        {/* LEFT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", fontSize: 10, color: C.tx, textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>📈 Position<HelpDot text="Configure your perp. Long = profit when price rises. Short = profit when price falls. Leverage multiplies both gains and losses." /></div>
            <Toggle options={[{ value: "long", label: "LONG", icon: "↗" }, { value: "short", label: "SHORT", icon: "↘" }]} value={dir} onChange={setDir} colors={{ long: C.g, short: C.r }} tip="Long profits when price rises. Short profits when price drops." />
            <div style={{ height: 8 }} />
            <MySlider label="Collateral" value={collateral} onChange={setCollateral} min={100} max={10000} step={100} unit="$" tip="Capital you put up. Max perp loss = collateral × leverage." />
            <MySlider label="Leverage" value={leverage} onChange={setLeverage} min={1} max={20} step={1} unit="x" tip="Multiplier. 3x on $1000 = $3000 notional exposure." />
            <MySlider label="Entry" value={entryPrice} onChange={setEntryPrice} min={+(asset.pr * 0.3).toFixed(4)} max={+(asset.pr * 3).toFixed(4)} step={pStep} unit="" tip={"Entry price for " + asset.sym + ". Current market: $" + asset.pr} />
            <MySlider label="Min Price Range" value={minVal} onChange={setMinVal} min={0} max={entryPrice} step={pStep} unit="" tip="Lowest simulated price. Set to 0 to see full downside scenarios." />
            <MySlider label="Max Price Range" value={maxVal} onChange={setMaxVal} min={entryPrice} max={+(asset.pr * 5).toFixed(4)} step={pStep} unit="" tip="Highest simulated price. Wider range = more comprehensive view." />
          </div>

          {/* HEDGES */}
          <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", fontSize: 10, color: C.tx, textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>🛡 Hedges ({hedges.length}/{asset.bets.length})<HelpDot text="Add Polymarket bets to hedge. Each share costs the odds price and pays $1 if correct. YES at 20¢ = 4:1 payout. NO at 80¢ = 0.25:1 payout. Cheap YES bets are powerful tail-risk hedges. Stack multiple for layered protection." /></div>
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
                    <InfoTip text={bet.q + "\n\nYES: " + yesOdds + "¢/share → win $1 → profit " + ((100 - yesOdds) / yesOdds).toFixed(2) + "x ($" + (100 * (100 - yesOdds) / yesOdds).toFixed(0) + " profit on $100 bet)\nNO: " + noOdds + "¢/share → win $1 → profit " + (yesOdds / noOdds).toFixed(2) + "x ($" + (100 * yesOdds / noOdds).toFixed(0) + " profit on $100 bet)\n\nCorrelation with " + asset.sym + " price: ρ = " + cv + "\n" + (cv > 0.2 ? "Positively correlated — moves with price." : cv < -0.2 ? "Negatively correlated — good inverse hedge!" : "Weakly correlated — provides diversification.")} pos="right">
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
                      <button onClick={function() { on ? rmHedge(bet.id) : addHedge(bet.id); }} style={{ padding: "3px 8px", borderRadius: 4, fontSize: 9, fontWeight: 600, cursor: "pointer", border: "1px solid " + (on ? C.r + "50" : C.g + "50"), background: on ? C.r + "12" : C.g + "12", color: on ? C.r : C.g, fontFamily: "monospace" }}>{on ? "✕" : "+ ADD"}</button>
                    </InfoTip>
                  </div>
                  {on && (<div style={{ marginTop: 6 }}>
                    <Toggle options={[{ value: "no", label: "NO", icon: "✗" }, { value: "yes", label: "YES", icon: "✓" }]} value={h.side} onChange={function(v) { updHedge(bet.id, "side", v); }} colors={{ no: C.o, yes: C.g }} tip={"YES costs " + yesOdds + "¢/share. $100 bet wins $" + (100 * (100 - yesOdds) / yesOdds).toFixed(0) + " profit (" + ((100 - yesOdds) / yesOdds).toFixed(1) + ":1). NO costs " + noOdds + "¢/share. $100 bet wins $" + (100 * yesOdds / noOdds).toFixed(0) + " profit (" + (yesOdds / noOdds).toFixed(1) + ":1). Cheap YES = high payout tail hedge. Cheap NO = steady income if status quo holds."} />
                    <div style={{ height: 5 }} />
                    <MySlider label="Size" value={h.size} onChange={function(v) { updHedge(bet.id, "size", v); }} min={10} max={500} step={10} unit="$" tip="Bet amount. More = more protection but more premium at risk if bet loses." />
                  </div>)}
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 6 }}>
            <InfoTip text="Tests thousands of hedge combos. Scores each by: avg P/L × 1.0 + worst case × 0.8 + best case × 0.15 − hedge cost × 0.05. Applies the best combo and gives a detailed trade recommendation." pos="right">
              <button onClick={runOpt} disabled={optimizing} style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid " + C.y + "50", background: "linear-gradient(135deg," + C.y + "15," + C.o + "10)", color: C.y, fontFamily: "monospace", fontSize: 12, fontWeight: 700, cursor: optimizing ? "wait" : "pointer" }}>{optimizing ? "⟳ ..." : "⚡ OPTIMIZE"}</button>
            </InfoTip>
            <InfoTip text="Download all scenarios as CSV." pos="left">
              <button onClick={dlCSV} style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid " + C.a + "40", background: C.a + "10", color: C.a, fontFamily: "monospace", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>↓ CSV</button>
            </InfoTip>
          </div>

          {/* DETAILED OPTIMIZER RESULT */}
          {optimResult && (<div style={{ padding: "10px 12px", borderRadius: 8, background: C.sL, border: "1px solid " + C.y + "30", fontSize: 10 }}>
            <div style={{ color: C.y, fontWeight: 700, fontSize: 12, marginBottom: 6 }}>⚡ OPTIMIZATION RESULT</div>
            <div style={{ color: C.tx, marginBottom: 4 }}>
              <strong>Composite Score: {optimResult.score}</strong>
              <HelpDot text={"Score = (Avg P/L × 1.0) + (Worst Case × 0.8) + (Best Case × 0.15) − (Hedge Cost × 0.05)\n\n= (" + optimResult.metrics.mean + " × 1.0) + (" + optimResult.metrics.worst + " × 0.8) + (" + optimResult.metrics.best + " × 0.15) − (" + optimResult.metrics.cost + " × 0.05)\n\nThis score balances average profitability, downside protection, upside potential, and hedge cost."} pos="right" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 6, fontSize: 10 }}>
              <div style={{ color: C.txM }}>Avg P/L: <span style={{ color: optimResult.metrics.mean >= 0 ? C.g : C.r, fontWeight: 600 }}>${optimResult.metrics.mean}</span></div>
              <div style={{ color: C.txM }}>Worst: <span style={{ color: C.r, fontWeight: 600 }}>${optimResult.metrics.worst}</span></div>
              <div style={{ color: C.txM }}>Best: <span style={{ color: C.g, fontWeight: 600 }}>${optimResult.metrics.best}</span></div>
              <div style={{ color: C.txM }}>Hedge Cost: <span style={{ color: C.o, fontWeight: 600 }}>${optimResult.metrics.cost}</span></div>
            </div>
            <div style={{ borderTop: "1px solid " + C.b, paddingTop: 6, marginBottom: 4 }}>
              <div style={{ fontSize: 10, color: C.txM }}>vs. No Hedge: Worst case <span style={{ color: optimResult.metrics.worstImprove > 0 ? C.g : C.r, fontWeight: 600 }}>{optimResult.metrics.worstImprove > 0 ? "+" : ""}{optimResult.metrics.worstImprove}</span> · Avg P/L <span style={{ color: optimResult.metrics.meanChange > 0 ? C.g : C.r, fontWeight: 600 }}>{optimResult.metrics.meanChange > 0 ? "+" : ""}{optimResult.metrics.meanChange}</span></div>
            </div>
            {optimResult.config.length > 0 && (<div style={{ marginBottom: 4 }}>
              {optimResult.config.map(function(h) { var bet = asset.bets.find(function(b) { return b.id === h.betId; }); return <div key={h.betId} style={{ color: C.tx, fontSize: 10 }}><span style={{ color: h.side === "no" ? C.o : C.g, fontWeight: 700 }}>{h.side.toUpperCase()}</span> ${h.size} — {bet ? bet.q : ""}</div>; })}
            </div>)}
            <div style={{ borderTop: "1px solid " + C.b, paddingTop: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: optimResult.metrics.worstImprove > 0 && optimResult.metrics.cost < collateral * 0.15 ? C.g : optimResult.config.length === 0 ? C.a : C.o }}>
                {optimResult.config.length === 0
                  ? "📊 RECOMMENDATION: No hedge needed — the unhedged position has the best risk-adjusted profile."
                  : optimResult.metrics.worstImprove > 0 && optimResult.metrics.cost < collateral * 0.15
                    ? "✅ HEDGE IS WORTH IT — Worst case improved by $" + optimResult.metrics.worstImprove + " for only $" + optimResult.metrics.cost + " in premiums (" + (optimResult.metrics.cost / collateral * 100).toFixed(1) + "% of collateral)."
                    : optimResult.metrics.worstImprove > 0
                      ? "⚠️ HEDGE HELPS but costs " + (optimResult.metrics.cost / collateral * 100).toFixed(1) + "% of collateral. Worst case improves by $" + optimResult.metrics.worstImprove + ". Consider if the protection justifies the premium."
                      : "❌ HEDGE NOT RECOMMENDED — Avg P/L drops by $" + Math.abs(optimResult.metrics.meanChange) + " and costs $" + optimResult.metrics.cost + ". Unhedged may be better here."
                }
              </div>
            </div>
          </div>)}
        </div>

        {/* ═══ RIGHT ═══ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Strip */}
          <InfoTip text="Current position summary at a glance." pos="bottom">
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", borderRadius: 8, background: C.sL, border: "1px solid " + C.b, fontSize: 11, flexWrap: "wrap", cursor: "help" }}>
              <span style={{ color: dir === "long" ? C.g : C.r, fontWeight: 700 }}>{dir === "long" ? "↗ LONG" : "↘ SHORT"} {asset.sym}</span>
              <span style={{ color: C.txD }}>·</span><span style={{ color: C.tx }}>{leverage}x @ ${entryPrice}</span>
              <span style={{ color: C.txD }}>·</span><span style={{ color: C.tx }}>Notional: ${(collateral * leverage).toLocaleString()}</span>
              <span style={{ color: C.txD }}>·</span><span style={{ color: C.tx }}>Hedges: {hedges.length} (${hedges.reduce(function(s, h) { return s + h.size; }, 0)})</span>
              <span style={{ color: C.txD }}>·</span><span style={{ color: "#ff6090" }}>Liq: ${liqPrice}</span>
            </div>
          </InfoTip>

          {/* Cards */}
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            <MetricCard label="Breakeven" value={"$" + risk.breakeven} color={C.g} icon="◎" tip="Price where net P/L = $0 after hedge premiums." />
            <MetricCard label="Liquidation" value={"$" + liqPrice} color="#ff6090" icon="⚠" tip={"At " + leverage + "x leverage, your position gets liquidated at $" + liqPrice + ". You lose your entire $" + collateral + " collateral. Hedges still pay out after liquidation."} />
            <MetricCard label="Worst" value={"$" + risk.worst.toLocaleString()} color={C.r} icon="▼" tip="Max downside across all simulated scenarios (capped at -$collateral for perp due to liquidation)." />
            <MetricCard label="Best" value={"$" + risk.best.toLocaleString()} color={C.g} icon="▲" tip="Max upside across all simulated scenarios." />
            <MetricCard label="Avg P/L" value={"$" + risk.mean} color={risk.mean >= 0 ? C.g : C.r} icon="μ" tip="Average P/L across all scenarios." />
            <MetricCard label="Vol" value={"$" + risk.vol} color={C.o} icon="σ" tip="Standard deviation — higher = more unpredictable." />
          </div>

          {/* ═══ COMBINED P/L + Breakdown + Variance Chart ═══ */}
          <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600 }}>P/L Zones + Components + Price Variance</span>
                <HelpDot text="Combined chart showing: Green/red fill = profit/loss zones. Cyan line = net P/L. Purple dashed = perp P/L. Orange dashed = hedge P/L. The shaded vertical band shows the historical price range over your selected time period — red band = prices below entry, green band = prices above entry." pos="bottom" />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 10, color: C.txM }}>Price Variance:</span>
                <select value={varPeriod} onChange={function(e) { setVarPeriod(e.target.value); }} style={{ background: C.sL, color: C.a, border: "1px solid " + C.b, borderRadius: 5, padding: "3px 8px", fontSize: 11, fontFamily: "monospace", cursor: "pointer" }}>
                  {varPeriods.map(function(vp) { return <option key={vp.v} value={vp.v}>{vp.l}</option>; })}
                </select>
                <HelpDot text="Select the lookback period for price variance. The colored band on the chart shows the min-max price range during this period. Longer periods = wider expected price ranges." pos="left" />
              </div>
            </div>
            <div style={{ fontSize: 10, color: C.txM, marginBottom: 8 }}>
              <span style={{ color: C.a }}>— Net P/L</span> · <span style={{ color: C.p }}>--- Perp</span> · <span style={{ color: C.o }}>--- Hedge</span> · <span style={{ color: C.r }}>▮</span> {varPeriod} downside range · <span style={{ color: C.g }}>▮</span> {varPeriod} upside range · <span style={{ color: "#ff6090" }}>⚠ Liq ${liqPrice}</span>
            </div>
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={scenarios} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="gG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.g} stopOpacity={0.35} /><stop offset="100%" stopColor={C.g} stopOpacity={0.02} /></linearGradient>
                  <linearGradient id="rG" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor={C.r} stopOpacity={0.35} /><stop offset="100%" stopColor={C.r} stopOpacity={0.02} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.b} />
                <XAxis dataKey="valuation" type="number" tick={{ fontSize: 11, fill: C.tx }} stroke={C.b} domain={["dataMin", "dataMax"]} tickCount={9} />
                <YAxis tick={{ fontSize: 11, fill: C.tx }} stroke={C.b} />
                <Tooltip content={<ChartTip />} />
                <ReferenceLine y={0} stroke={C.txD} strokeDasharray="4 4" strokeOpacity={0.5} />
                <ReferenceLine x={entryPrice} stroke={C.a} strokeWidth={1.5} strokeDasharray="4 4" strokeOpacity={0.8} label={{ value: "Entry", position: "top", fill: C.a, fontSize: 10, fontWeight: 700 }} />
                <ReferenceLine x={liqPrice} stroke="#ff6090" strokeWidth={2} strokeDasharray="8 4" strokeOpacity={0.9} label={{ value: "LIQ", position: "insideTopRight", fill: "#ff6090", fontSize: 10, fontWeight: 700 }} />
                <ReferenceLine x={priceVar.low} stroke={C.r} strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.6} label={{ value: varPeriod + " Lo", position: "insideBottomLeft", fill: C.r, fontSize: 9 }} />
                <ReferenceLine x={priceVar.high} stroke={C.g} strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.6} label={{ value: varPeriod + " Hi", position: "insideBottomRight", fill: C.g, fontSize: 9 }} />
                <Area type="monotone" dataKey="varRed" stroke="none" fill={C.r} fillOpacity={0.12} connectNulls={false} name="Downside Range" isAnimationActive={false} />
                <Area type="monotone" dataKey="varGreen" stroke="none" fill={C.g} fillOpacity={0.12} connectNulls={false} name="Upside Range" isAnimationActive={false} />
                <Area type="monotone" dataKey="pos" stroke="none" fill="url(#gG)" name="Profit Zone" />
                <Area type="monotone" dataKey="neg" stroke="none" fill="url(#rG)" name="Loss Zone" />
                <Line type="monotone" dataKey="perpPL" name="Perp P/L" stroke={C.p} strokeWidth={2} dot={false} strokeDasharray="6 3" />
                <Line type="monotone" dataKey="hedgePL" name="Hedge P/L" stroke={C.o} strokeWidth={2} dot={false} strokeDasharray="6 3" />
                <Line type="monotone" dataKey="netPL" name="Net P/L" stroke={C.a} strokeWidth={2.5} dot={false} />
                <ReferenceLine y={-collateral} stroke="#ff6090" strokeWidth={1} strokeDasharray="4 4" strokeOpacity={0.4} label={{ value: "Max Loss -$" + collateral, position: "left", fill: "#ff6090", fontSize: 9 }} />
                <Brush dataKey="valuation" height={20} stroke={C.bL} fill={C.sL} />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 6, fontSize: 10, color: C.txM }}>
              <span>{varPeriod} Low: <span style={{ color: C.r, fontWeight: 600 }}>${priceVar.low.toFixed(2)}</span></span>
              <span>{varPeriod} High: <span style={{ color: C.g, fontWeight: 600 }}>${priceVar.high.toFixed(2)}</span></span>
              <span>Range: <span style={{ color: C.a, fontWeight: 600 }}>${(priceVar.high - priceVar.low).toFixed(2)}</span></span>
            </div>
          </div>

          {/* 3D SURFACE */}
          <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}><span style={{ fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600 }}>3D P/L Surface</span><HelpDot text="3D surface: Net P/L across Price (X) × Leverage (Z). Green peaks = profit, red valleys = loss. Drag horizontally to rotate (yaw), vertically to tilt (pitch). Values shown on all three axes." pos="bottom" /></div>
            <div style={{ fontSize: 10, color: C.txM, marginBottom: 8 }}><span style={{ color: C.a }}>X: Price</span> · <span style={{ color: C.p }}>Z: Leverage</span> · <span style={{ color: C.g }}>Y: Net P/L</span> · Drag to rotate on all axes</div>
            <Surface3D scenarios={scenarios} leverage={leverage} collateral={collateral} entryPrice={entryPrice} dir={dir} hedges={hedges} asset={asset} />
          </div>

          {/* 7-Day History */}
          <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 10 }}><span style={{ fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600 }}>7-Day: {asset.sym} Price vs Bet Odds</span><HelpDot text="Overlays 7-day price (left axis) with bet odds (right axis). Look for divergences — when price drops but odds rise, it may signal a hedging opportunity." pos="bottom" /></div>
            <ResponsiveContainer width="100%" height={210}>
              <LineChart data={histData} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.b} />
                <XAxis dataKey="t" tick={{ fontSize: 11, fill: C.tx }} stroke={C.b} interval={Math.floor(histData.length / 7)} />
                <YAxis yAxisId="p" tick={{ fontSize: 11, fill: C.tx }} stroke={C.b} domain={["auto", "auto"]} />
                <YAxis yAxisId="o" orientation="right" tick={{ fontSize: 11, fill: C.tx }} stroke={C.b} domain={[0, 100]} />
                <Tooltip content={<ChartTip />} />
                <Line yAxisId="p" type="monotone" dataKey="price" name={asset.sym + " Price"} stroke={C.a} strokeWidth={2} dot={false} />
                {asset.bets.map(function(b, i) { return <Line key={b.id} yAxisId="o" type="monotone" dataKey={b.id} name={b.q.slice(0, 28)} stroke={betCols[i]} strokeWidth={1.2} dot={false} strokeDasharray="5 3" />; })}
                <Brush dataKey="t" height={18} stroke={C.bL} fill={C.sL} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Correlation */}
          <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 10 }}><span style={{ fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600 }}>7-Day Correlation</span><HelpDot text="Pearson ρ: +1 = move together, -1 = move opposite (ideal for hedging!), 0 = uncorrelated. Negative ρ bets are best hedges — they gain when your perp loses." pos="bottom" /></div>
            <ResponsiveContainer width="100%" height={Math.max(80, corrData.length * 38)}>
              <BarChart data={corrData} layout="vertical" margin={{ top: 0, right: 15, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.b} />
                <XAxis type="number" domain={[-1, 1]} tick={{ fontSize: 11, fill: C.tx }} stroke={C.b} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: C.tx }} stroke={C.b} width={130} />
                <Tooltip formatter={function(v) { return [v.toFixed(3), "ρ"]; }} contentStyle={{ background: C.s, border: "1px solid " + C.bL, borderRadius: 6, fontSize: 11, fontFamily: "monospace" }} />
                <ReferenceLine x={0} stroke={C.txD} />
                <Bar dataKey="corr" radius={[0, 4, 4, 0]}>{corrData.map(function(d, i) { return <Cell key={i} fill={d.corr > 0.2 ? C.g : d.corr < -0.2 ? C.r : C.txD} fillOpacity={0.75} />; })}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div style={{ background: C.s, border: "1px solid " + C.b, borderRadius: 10, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}><span style={{ fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600 }}>Scenarios</span><HelpDot text="P/L at each price point. Net P/L is color-coded. Export CSV for full 100-point dataset." pos="bottom" /><span style={{ fontSize: 9, color: C.txM, marginLeft: 4 }}>{tableRows.length} rows</span></div>
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

          <div style={{ textAlign: "center", fontSize: 9, color: C.txM, padding: "6px 0" }}>DefiDummy's Hedge Deal Sniffer v5.0 · Real Polymarket bet titles, simulated odds/history · Not financial advice</div>
        </div>
      </div>
    </div>
  );
}
