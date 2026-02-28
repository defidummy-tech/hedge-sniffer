// ═══ Bot Kill Switch API ═══
// Immediately closes ALL open positions on Hyperliquid and disables the bot.

import { NextRequest, NextResponse } from "next/server";
import * as journal from "../../../services/tradeJournal";
import { closeAllPositions } from "../../../services/tradingBot";

export var dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  var start = Date.now();
  var closed: string[] = [];
  var errors: string[] = [];

  try {
    // 1. Disable the bot immediately
    journal.updateConfig({ enabled: false });
    journal.logAction("KILL", "Kill switch activated — closing all positions");

    // 2. Close all positions on Hyperliquid
    var result = await closeAllPositions();
    closed = result.closed;
    errors = result.errors;

    // 3. Mark all journal trades as closed
    var openTrades = journal.getOpenTrades();
    for (var trade of openTrades) {
      journal.closeTrade(trade.id, trade.entryPrice, 0, "kill_switch", 0, 0);
    }

    var elapsed = ((Date.now() - start) / 1000).toFixed(1) + "s";

    return NextResponse.json({
      ok: true,
      elapsed: elapsed,
      closed: closed,
      errors: errors,
      message: "Bot disabled. " + closed.length + " position(s) closed.",
    });
  } catch (e: any) {
    journal.logAction("ERROR", "Kill switch failed: " + e.message);
    return NextResponse.json({
      ok: false,
      error: e.message,
      closed: closed,
      errors: errors,
    }, { status: 500 });
  }
}
