// ═══ Bot Kill Switch API ═══
// Immediately closes ALL open positions on Hyperliquid and disables the bot.

import { NextRequest, NextResponse } from "next/server";
import * as journal from "../../../services/tradeJournal";
import { closeAllPositions, getPositionDetails } from "../../../services/tradingBot";

export var dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  var start = Date.now();
  var closed: string[] = [];
  var errors: string[] = [];

  try {
    // 1. Disable the bot immediately
    await journal.updateConfig({ enabled: false });
    journal.logAction("KILL", "Kill switch activated — closing all positions");

    // 2. Fetch live P&L data BEFORE closing positions
    var pnlDetails: Record<string, { unrealizedPnl: number; cumFunding: number; midPrice: number }> = {};
    try {
      pnlDetails = await getPositionDetails();
    } catch (e: any) {
      journal.logAction("ERROR", "Kill: failed to fetch P&L details: " + e.message);
    }

    // 3. Close all positions on Hyperliquid
    var result = await closeAllPositions();
    closed = result.closed;
    errors = result.errors;

    // 4. Mark all journal trades as closed with actual P&L
    var config2 = await journal.getConfig();
    var openTrades = await journal.getOpenTrades(config2.paperTrading ? true : undefined);
    for (var trade of openTrades) {
      var details = pnlDetails[trade.coin];
      if (details) {
        await journal.closeTrade(
          trade.id,
          details.midPrice,
          0,
          "kill_switch",
          details.unrealizedPnl,
          details.cumFunding
        );
      } else {
        // Fallback: no live data available
        await journal.closeTrade(trade.id, trade.entryPrice, 0, "kill_switch", 0, 0);
      }
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
