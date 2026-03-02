// ═══ Bot Status API ═══
// Returns current bot config, account balance, open positions, and recent activity.

import { NextResponse } from "next/server";
import * as journal from "../../../services/tradeJournal";
import { getAccountStatus, getFundingRates, getPositionDetails } from "../../../services/tradingBot";

export var dynamic = "force-dynamic";

export async function GET() {
  try {
    var config = await journal.getConfig();
    var openTrades = await journal.getOpenTrades(config.paperTrading ? true : undefined);
    var recentActions = journal.getRecentActions(50);

    // Try to get live account data
    var account = { balance: 0, marginUsed: 0, positions: [] as any[], walletAddress: "", error: "", debug: {} as any };
    try {
      account = await getAccountStatus();
    } catch (e: any) {
      account.error = e.message || "Unknown error";
    }

    // Enrich open trades with live P&L and fetch funding rates
    var fundingRates: Record<string, number> = {};
    if (openTrades.length > 0) {
      try {
        var liveDetails = await getPositionDetails();
        for (var i = 0; i < openTrades.length; i++) {
          var details = liveDetails[openTrades[i].coin];
          if (details) {
            openTrades[i] = {
              ...openTrades[i],
              pnl: details.unrealizedPnl,
              fundingEarned: details.cumFunding,
              totalReturn: details.unrealizedPnl + details.cumFunding,
            };
          }
        }
      } catch (e: any) {
        // Live data fetch failed — show journal data as-is
      }
      try {
        fundingRates = await getFundingRates();
      } catch (e: any) {
        // Non-critical — positions still work without live funding
      }
    }

    return NextResponse.json({
      ok: true,
      config: config,
      accountBalance: account.balance,
      marginUsed: account.marginUsed,
      openPositions: openTrades,
      livePositions: account.positions,
      recentActions: recentActions,
      walletAddress: account.walletAddress,
      accountError: account.error || null,
      debug: account.debug || null,
      fundingRates: fundingRates,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
