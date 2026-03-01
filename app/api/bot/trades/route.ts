// ═══ Bot Trades API ═══
// Returns all trades (open and closed) for the performance dashboard.
// Open trades are enriched with live P&L data from Hyperliquid.

import { NextResponse } from "next/server";
import * as journal from "../../../services/tradeJournal";
import { getPositionDetails } from "../../../services/tradingBot";

export var dynamic = "force-dynamic";

export async function GET() {
  try {
    var trades = await journal.getAllTrades();

    // Enrich open trades with live P&L from Hyperliquid
    var openTrades = trades.filter(function(t) { return t.status === "open"; });
    if (openTrades.length > 0) {
      try {
        var liveDetails = await getPositionDetails();
        for (var i = 0; i < trades.length; i++) {
          if (trades[i].status !== "open") continue;
          var details = liveDetails[trades[i].coin];
          if (details) {
            trades[i] = {
              ...trades[i],
              // Don't set exitPrice — trade is still open, keep it null
              pnl: details.unrealizedPnl,
              fundingEarned: details.cumFunding,
              totalReturn: details.unrealizedPnl + details.cumFunding,
            };
          }
        }
      } catch (e: any) {
        // Live data fetch failed — return trades with zeros for open positions
        console.error("Live P&L fetch failed:", e.message);
      }
    }

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
