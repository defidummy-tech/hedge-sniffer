// ═══ Bot Status API ═══
// Returns current bot config, account balance, open positions, and recent activity.

import { NextResponse } from "next/server";
import * as journal from "../../../services/tradeJournal";
import { getAccountStatus } from "../../../services/tradingBot";

export var dynamic = "force-dynamic";

export async function GET() {
  try {
    var config = journal.getConfig();
    var openTrades = journal.getOpenTrades();
    var recentActions = journal.getRecentActions(50);

    // Try to get live account data
    var account = { balance: 0, marginUsed: 0, positions: [] as any[] };
    try {
      account = await getAccountStatus();
    } catch (e) {
      // SDK not initialized or no key — return zeros
    }

    return NextResponse.json({
      ok: true,
      config: config,
      accountBalance: account.balance,
      marginUsed: account.marginUsed,
      openPositions: openTrades,
      livePositions: account.positions,
      recentActions: recentActions,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
