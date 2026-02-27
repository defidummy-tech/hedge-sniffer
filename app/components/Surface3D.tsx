"use client";
import { useRef, useEffect } from "react";
import { C } from "../utils/constants";
import type { Scenario, Asset, Hedge, Direction } from "../types";

interface Surface3DProps {
  scenarios: Scenario[];
  leverage: number;
  collateral: number;
  entryPrice: number;
  dir: Direction;
  hedges: Hedge[];
  asset: Asset;
}

export default function Surface3D({ scenarios, leverage, collateral, entryPrice, dir, hedges, asset }: Surface3DProps) {
  var canvasRef = useRef<HTMLCanvasElement>(null);
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
    var grid: number[][] = [];
    for (var r = 0; r < rows; r++) {
      var row: number[] = [];
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

    var animId: number;
    function project(x: number, y: number, z: number, yaw: number, pitch: number) {
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
      ctx!.fillStyle = C.bg;
      ctx!.fillRect(0, 0, W, H);

      var faces: { projected: any[]; fillColor: string; avgDepth: number }[] = [];
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
          var fc: string;
          if (norm > 0) { var gv = Math.floor(60 + norm * 195); fc = "rgba(0," + gv + ",60,0.9)"; }
          else { var rv = Math.floor(60 + Math.abs(norm) * 195); fc = "rgba(" + rv + ",15,40,0.9)"; }
          faces.push({ projected: projected, fillColor: fc, avgDepth: avgD });
        }
      }
      faces.sort(function(a, b) { return b.avgDepth - a.avgDepth; });
      for (var fi = 0; fi < faces.length; fi++) {
        var face = faces[fi];
        ctx!.beginPath();
        ctx!.moveTo(face.projected[0].px, face.projected[0].py);
        ctx!.lineTo(face.projected[1].px, face.projected[1].py);
        ctx!.lineTo(face.projected[2].px, face.projected[2].py);
        ctx!.lineTo(face.projected[3].px, face.projected[3].py);
        ctx!.closePath();
        ctx!.fillStyle = face.fillColor;
        ctx!.fill();
        ctx!.strokeStyle = "rgba(42,58,84,0.3)";
        ctx!.lineWidth = 0.5;
        ctx!.stroke();
      }

      // Zero plane
      ctx!.strokeStyle = "rgba(120,140,170,0.25)";
      ctx!.lineWidth = 1;
      ctx!.setLineDash([4, 4]);
      var za = project(-1.5, 0, -1.5, yaw, pitch), zb = project(1.5, 0, -1.5, yaw, pitch), zc = project(1.5, 0, 1.5, yaw, pitch), zd = project(-1.5, 0, 1.5, yaw, pitch);
      ctx!.beginPath(); ctx!.moveTo(za.px, za.py); ctx!.lineTo(zb.px, zb.py); ctx!.lineTo(zc.px, zc.py); ctx!.lineTo(zd.px, zd.py); ctx!.closePath(); ctx!.stroke();
      ctx!.setLineDash([]);

      // Axis values
      ctx!.font = "bold 11px monospace";
      ctx!.fillStyle = "#00e5ff";
      var pLabels = [0, 0.25, 0.5, 0.75, 1];
      for (var pi = 0; pi < pLabels.length; pi++) {
        var pv = pMin + (pMax - pMin) * pLabels[pi];
        var pp = project((pLabels[pi] - 0.5) * 3, -1.4, -1.7, yaw, pitch);
        ctx!.fillText("$" + pv.toFixed(pv > 10 ? 0 : 2), pp.px - 15, pp.py);
      }
      ctx!.fillStyle = "#b388ff";
      var levLabels = [0, 2, 4, 7];
      for (var li = 0; li < levLabels.length; li++) {
        var idx = levLabels[li];
        if (idx < levs.length) {
          var lp = project(1.7, -1.4, (idx / (rows - 1) - 0.5) * 3, yaw, pitch);
          ctx!.fillText(levs[idx] + "x", lp.px, lp.py);
        }
      }
      ctx!.fillStyle = "#00e676";
      var plVals = [-maxAbs, -maxAbs * 0.5, 0, maxAbs * 0.5, maxAbs];
      for (var yi = 0; yi < plVals.length; yi++) {
        var yp = project(-1.8, plVals[yi] / maxAbs * 1.6, -1.7, yaw, pitch);
        ctx!.fillText("$" + plVals[yi].toFixed(0), yp.px - 25, yp.py);
      }

      // Axis labels
      ctx!.font = "bold 12px monospace";
      ctx!.fillStyle = "#00e5ff";
      var lbl1 = project(0, -1.8, -2, yaw, pitch);
      ctx!.fillText("Price →", lbl1.px - 20, lbl1.py);
      ctx!.fillStyle = "#b388ff";
      var lbl2 = project(2, -1.8, 0, yaw, pitch);
      ctx!.fillText("Leverage →", lbl2.px - 25, lbl2.py);
      ctx!.fillStyle = "#00e676";
      var lbl3 = project(-2, 0.8, -2, yaw, pitch);
      ctx!.fillText("Net P/L ↑", lbl3.px - 20, lbl3.py);

      if (!dragRef.current) angleRef.current += 0.003;
      animId = requestAnimationFrame(draw);
    }
    draw();

    var onDown = function(e: any) { dragRef.current = true; lxRef.current = (e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0)); lyRef.current = (e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0)); };
    var onUp = function() { dragRef.current = false; };
    var onMove = function(e: any) { if (!dragRef.current) return; var cx = (e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0)); var cy = (e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0)); angleRef.current += (cx - lxRef.current) * 0.008; pitchRef.current += (cy - lyRef.current) * 0.005; lxRef.current = cx; lyRef.current = cy; };
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
