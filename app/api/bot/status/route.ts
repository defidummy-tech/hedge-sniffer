// ═══ Bot Status API ═══
// Returns current bot config, account balance, open positions, and recent activity.
// IMPORTANT: Exchange positions are the source of truth for "Active Positions."
// Journal data enriches exchange positions (entry time, funding earned, etc.)
// but never overrides what the exchange says is open.

import { NextResponse } from "next/server";
import * as journal from "../../../services/tradeJournal";
import { getAccountStatus, getFundingRates, getPositionDetails } from "../../../services/tradingBot";

export var dynamic = "force-dynamic";

export async function GET() {
  try {
    var config = await journal.getConfig();
    var recentActions = journal.getRecentActions(50);

    // Try to get live account data (includes exchange positions)
    // Always force refresh — dashboard must show current exchange state, not cached
    var account = { balance: 0, marginUsed: 0, positions: [] as any[], walletAddress: "", error: "", debug: {} as any };
    try {
      account = await getAccountStatus(true);
    } catch (e: any) {
      account.error = e.message || "Unknown error";
    }

    // Paper mode: use journal as source of truth (no exchange positions)
    if (config.paperTrading) {
      var paperTrades = await journal.getOpenTrades(true);
      var fundingRates: Record<string, number> = {};
      if (paperTrades.length > 0) {
        try {
          var liveDetails = await getPositionDetails();
          for (var i = 0; i < paperTrades.length; i++) {
            var details = liveDetails[paperTrades[i].coin];
            if (details) {
              paperTrades[i] = {
                ...paperTrades[i],
                pnl: details.unrealizedPnl,
                fundingEarned: details.cumFunding,
                totalReturn: details.unrealizedPnl + details.cumFunding,
              };
            }
          }
        } catch (e: any) { /* fallback to journal data */ }
        try { fundingRates = await getFundingRates(); } catch (e: any) { /* non-critical */ }
      }

      return NextResponse.json({
        ok: true,
        config: config,
        accountBalance: account.balance,
        marginUsed: account.marginUsed,
        openPositions: paperTrades,
        livePositions: [],
        recentActions: recentActions,
        walletAddress: account.walletAddress,
        accountError: account.error || null,
        debug: account.debug || null,
        fundingRates: fundingRates,
      });
    }

    // ── Real mode: Exchange positions are the source of truth ──
    // Build openPositions from exchange data, enriched with journal where available
    var journalTrades = await journal.getOpenTrades(false);
    var journalByCoins: Record<string, any> = {};
    for (var jt of journalTrades) {
      journalByCoins[jt.coin] = jt;
    }

    // Get live PnL details and funding rates
    var positionDetails: Record<string, any> = {};
    var fundingRatesMap: Record<string, number> = {};
    try { positionDetails = await getPositionDetails(true); } catch (e: any) { /* non-critical */ }
    try { fundingRatesMap = await getFundingRates(); } catch (e: any) { /* non-critical */ }

    // Build positions from exchange data
    var exchangePositions: any[] = [];
    for (var lp of account.positions) {
      var coin = lp.coin;
      var szi = parseFloat(lp.size);
      var direction = szi > 0 ? "long" : "short";
      var entryPx = parseFloat(lp.entryPx);
      var leverage = lp.leverage || config.leverage;

      // Try to find matching journal trade for enrichment
      var jTrade = journalByCoins[coin];
      var pnlDetails = positionDetails[coin];

      exchangePositions.push({
        id: jTrade ? jTrade.id : "live_" + coin.replace(/[^a-zA-Z0-9]/g, "_"),
        coin: coin,
        direction: direction,
        sizeUSD: jTrade ? jTrade.sizeUSD : Math.abs(szi * entryPx / leverage),
        leverage: leverage,
        entryPrice: entryPx,
        entryTime: jTrade ? jTrade.entryTime : Date.now(),
        entryFundingAPR: jTrade ? jTrade.entryFundingAPR : 0,
        pnl: pnlDetails ? pnlDetails.unrealizedPnl : parseFloat(lp.unrealizedPnl || "0"),
        fundingEarned: pnlDetails ? pnlDetails.cumFunding : (jTrade ? jTrade.fundingEarned : 0),
        totalReturn: pnlDetails
          ? pnlDetails.unrealizedPnl + pnlDetails.cumFunding
          : parseFloat(lp.unrealizedPnl || "0"),
        status: "open",
        spotHedge: jTrade ? jTrade.spotHedge : false,
        paper: false,
      });
    }

    return NextResponse.json({
      ok: true,
      config: config,
      accountBalance: account.balance,
      marginUsed: account.marginUsed,
      openPositions: exchangePositions, // Exchange-based (source of truth)
      livePositions: account.positions, // Raw exchange data
      recentActions: recentActions,
      walletAddress: account.walletAddress,
      accountError: account.error || null,
      debug: account.debug || null,
      fundingRates: fundingRatesMap,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
