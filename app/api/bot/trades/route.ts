// ═══ Bot Trades API ═══
// Returns all trades (open and closed) for the performance dashboard.

import { NextResponse } from "next/server";
import * as journal from "../../../services/tradeJournal";

export var dynamic = "force-dynamic";

export async function GET() {
  try {
    var trades = journal.getAllTrades();
    var open = trades.filter(function(t) { return t.status === "open"; });
    var closed = trades.filter(function(t) { return t.status !== "open"; });

    return NextResponse.json({
      ok: true,
      trades: trades,
      summary: {
        total: trades.length,
        open: open.length,
        closed: closed.length,
        totalPnL: trades.reduce(function(s, t) { return s + t.totalReturn; }, 0),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
