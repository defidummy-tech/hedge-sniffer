// ═══ Bot Trades API ═══
// Returns all trades (open and closed) for the performance dashboard.
// IMPORTANT: Exchange positions are the source of truth for open trade count.
// If a position exists on the exchange but not in the journal, it's included.
// If a journal trade says "open" but no exchange position exists, it's excluded.

import { NextRequest, NextResponse } from "next/server";
import * as journal from "../../../services/tradeJournal";
import { getPositionDetails, getAccountStatus } from "../../../services/tradingBot";

export var dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    var config = await journal.getConfig();
    var allTrades = await journal.getAllTrades();

    // Filter by paper mode: ?paper=true or ?paper=false, or auto based on current mode
    var url = new URL(req.url);
    var paperParam = url.searchParams.get("paper");
    var isPaper = false;
    if (paperParam === "true") {
      isPaper = true;
      allTrades = allTrades.filter(function(t) { return t.paper === true; });
    } else if (paperParam === "false") {
      allTrades = allTrades.filter(function(t) { return !t.paper; });
    } else if (config.paperTrading) {
      isPaper = true;
      allTrades = allTrades.filter(function(t) { return t.paper === true; });
    } else {
      allTrades = allTrades.filter(function(t) { return !t.paper; });
    }

    // Separate closed trades (these are fine as-is from journal)
    var closedTrades = allTrades.filter(function(t) { return t.status !== "open"; });

    // ── Open positions: use exchange as source of truth ──
    // This ensures the trades endpoint ALWAYS matches what the exchange shows,
    // fixing the persistent mismatch between dashboard views.
    var openTrades: any[] = [];

    if (isPaper) {
      // Paper mode: journal IS the source of truth
      openTrades = allTrades.filter(function(t) { return t.status === "open"; });
      // Enrich with live prices
      try {
        var paperDetails = await getPositionDetails();
        for (var i = 0; i < openTrades.length; i++) {
          var pd = paperDetails[openTrades[i].coin];
          if (pd) {
            openTrades[i] = {
              ...openTrades[i],
              pnl: pd.unrealizedPnl,
              fundingEarned: pd.cumFunding,
              totalReturn: pd.unrealizedPnl + pd.cumFunding,
            };
          }
        }
      } catch (e: any) { /* fallback to journal data */ }
    } else {
      // Live mode: exchange is the source of truth
      var journalOpenTrades = allTrades.filter(function(t) { return t.status === "open"; });
      var journalByCoins: Record<string, any> = {};
      for (var jt of journalOpenTrades) {
        journalByCoins[jt.coin] = jt;
      }

      // Fetch exchange positions + live PnL
      var account = { positions: [] as any[] };
      var liveDetails: Record<string, any> = {};
      try {
        account = await getAccountStatus(true);
      } catch (e: any) {
        // Exchange fetch failed — fall back to journal
        console.error("Exchange fetch failed, falling back to journal:", e.message);
        openTrades = journalOpenTrades;
        account = { positions: [] };
      }

      try {
        liveDetails = await getPositionDetails(true);
      } catch (e: any) { /* non-critical */ }

      // If we got exchange data, build open trades from it
      if (account.positions.length > 0 || openTrades.length === 0) {
        openTrades = [];
        for (var lp of account.positions) {
          var coin = lp.coin;
          var szi = parseFloat(lp.size);
          var direction = szi > 0 ? "long" : "short";
          var entryPx = parseFloat(lp.entryPx);
          var leverage = lp.leverage || config.leverage;
          var pnlDetails = liveDetails[coin];

          // Find matching journal trade for enrichment
          var jTrade = journalByCoins[coin];

          openTrades.push({
            id: jTrade ? jTrade.id : "live_" + coin.replace(/[^a-zA-Z0-9]/g, "_"),
            coin: coin,
            direction: direction,
            sizeUSD: jTrade ? jTrade.sizeUSD : Math.abs(szi * entryPx / leverage),
            leverage: leverage,
            entryPrice: jTrade ? jTrade.entryPrice : entryPx,
            entryTime: jTrade ? jTrade.entryTime : Date.now(),
            entryFundingAPR: jTrade ? jTrade.entryFundingAPR : 0,
            exitPrice: null,
            exitTime: null,
            exitFundingAPR: null,
            exitReason: null,
            pnl: pnlDetails ? pnlDetails.unrealizedPnl : parseFloat(lp.unrealizedPnl || "0"),
            fundingEarned: pnlDetails ? pnlDetails.cumFunding : (jTrade ? jTrade.fundingEarned : 0),
            totalReturn: pnlDetails
              ? pnlDetails.unrealizedPnl + pnlDetails.cumFunding
              : parseFloat(lp.unrealizedPnl || "0"),
            status: "open",
            spotHedge: jTrade ? jTrade.spotHedge : false,
            spotEntryPrice: jTrade ? jTrade.spotEntryPrice : null,
            spotExitPrice: null,
            paper: false,
            lastFundingCheck: jTrade ? jTrade.lastFundingCheck : undefined,
            stopPrice: jTrade ? jTrade.stopPrice : undefined,
            settlementsCaptured: jTrade ? jTrade.settlementsCaptured : 0,
          });
        }
      }
    }

    // Combine: exchange-sourced open trades + journal closed trades
    var trades = openTrades.concat(closedTrades);

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
