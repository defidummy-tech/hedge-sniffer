// ═══ Bot Trade Cleanup API ═══
// DELETE: Remove phantom/duplicate trade entries by ID
// POST: Auto-detect and remove ghost trades (journal open but no exchange position)

import { NextRequest, NextResponse } from "next/server";
import * as journal from "../../../services/tradeJournal";
import { getPositionDetails } from "../../../services/tradingBot";

export var dynamic = "force-dynamic";

// DELETE /api/bot/cleanup — remove specific trades by ID
export async function DELETE(req: NextRequest) {
  try {
    var body = await req.json();
    var ids: string[] = body.ids || [];
    if (ids.length === 0) {
      return NextResponse.json({ ok: false, error: "No trade IDs provided" }, { status: 400 });
    }
    var removed = await journal.deleteTrades(ids);
    return NextResponse.json({ ok: true, removed: removed });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// POST /api/bot/cleanup — auto-detect and remove ghost trades
export async function POST(req: NextRequest) {
  try {
    var openTrades = await journal.getOpenTrades();
    var livePositions: Record<string, any> = {};
    try {
      livePositions = await getPositionDetails();
    } catch (e: any) {
      return NextResponse.json({
        ok: false,
        error: "Failed to fetch live positions: " + e.message,
      }, { status: 500 });
    }

    // Find ghost trades: journal says open, but no exchange position
    var ghostIds: string[] = [];
    var ghostCoins: string[] = [];
    for (var trade of openTrades) {
      if (!livePositions[trade.coin]) {
        ghostIds.push(trade.id);
        ghostCoins.push(trade.coin);
      }
    }

    if (ghostIds.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No ghost trades found — journal matches exchange",
        openJournal: openTrades.length,
        livePositions: Object.keys(livePositions).length,
      });
    }

    var removed = await journal.deleteTrades(ghostIds);
    return NextResponse.json({
      ok: true,
      removed: removed,
      ghostCoins: ghostCoins,
      message: "Removed " + removed + " ghost trade(s) not found on exchange",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// GET /api/bot/cleanup — dry-run: show ghost trades + duplicate churn entries
export async function GET(req: NextRequest) {
  try {
    var allTrades = await journal.getAllTrades();
    var openTrades = allTrades.filter(function(t) { return t.status === "open"; });
    var livePositions: Record<string, any> = {};
    try {
      livePositions = await getPositionDetails();
    } catch (e: any) {
      return NextResponse.json({
        ok: false,
        error: "Failed to fetch live positions: " + e.message,
      }, { status: 500 });
    }

    // Ghost trades: journal open, no exchange position
    var ghosts: Array<{ id: string; coin: string; direction: string; sizeUSD: number; entryTime: number }> = [];
    for (var trade of openTrades) {
      if (!livePositions[trade.coin]) {
        ghosts.push({
          id: trade.id,
          coin: trade.coin,
          direction: trade.direction,
          sizeUSD: trade.sizeUSD,
          entryTime: trade.entryTime,
        });
      }
    }

    // Churn duplicates: multiple closed trades for same coin with same entry price
    // (indicates phantom close/reopen cycle)
    var closedTrades = allTrades.filter(function(t) { return t.status !== "open"; });
    var churnMap: Record<string, typeof closedTrades> = {};
    for (var ct of closedTrades) {
      var key = ct.coin + "|" + ct.entryPrice + "|" + ct.direction;
      if (!churnMap[key]) churnMap[key] = [];
      churnMap[key].push(ct);
    }
    var churnDupes: Array<{ id: string; coin: string; pnl: number; exitReason: string | null; entryTime: number }> = [];
    for (var ck in churnMap) {
      if (churnMap[ck].length > 1) {
        // All but the first are duplicates from churn
        for (var di = 1; di < churnMap[ck].length; di++) {
          var d = churnMap[ck][di];
          churnDupes.push({
            id: d.id,
            coin: d.coin,
            pnl: d.totalReturn,
            exitReason: d.exitReason,
            entryTime: d.entryTime,
          });
        }
      }
    }

    var totalIssues = ghosts.length + churnDupes.length;
    return NextResponse.json({
      ok: true,
      openJournal: openTrades.length,
      livePositions: Object.keys(livePositions).length,
      ghosts: ghosts,
      churnDuplicates: churnDupes,
      fakePnL: churnDupes.reduce(function(s, d) { return s + d.pnl; }, 0),
      message: totalIssues > 0
        ? ghosts.length + " ghost(s) + " + churnDupes.length + " churn duplicate(s) found — POST to remove ghosts, DELETE with {ids:[...]} for duplicates"
        : "Clean — journal matches exchange, no duplicates",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
