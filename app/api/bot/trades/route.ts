// ═══ Bot Trades API ═══
// Returns all trades (open and closed) for the performance dashboard.
// Open trades are enriched with live P&L data from Hyperliquid.

import { NextRequest, NextResponse } from "next/server";
import * as journal from "../../../services/tradeJournal";
import { getPositionDetails } from "../../../services/tradingBot";

export var dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    var config = await journal.getConfig();
    var trades = await journal.getAllTrades();

    // Filter by paper mode: ?paper=true or ?paper=false, or auto based on current mode
    var url = new URL(req.url);
    var paperParam = url.searchParams.get("paper");
    if (paperParam === "true") {
      trades = trades.filter(function(t) { return t.paper === true; });
    } else if (paperParam === "false") {
      trades = trades.filter(function(t) { return !t.paper; });
    } else if (config.paperTrading) {
      trades = trades.filter(function(t) { return t.paper === true; });
    } else {
      trades = trades.filter(function(t) { return !t.paper; });
    }

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
