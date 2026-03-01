// ═══ Bot Tick Cron Endpoint ═══
// Called every 10 minutes by external cron (cron-job.org).
// Scans funding rates, opens/closes positions.
//
// ┌────────────────────────────┬───────────────────────────┬────────────────┐
// │ Env Var                    │ Description               │ Default        │
// ├────────────────────────────┼───────────────────────────┼────────────────┤
// │ CRON_SECRET                │ Bearer token              │ (required)     │
// │ HYPERLIQUID_PRIVATE_KEY    │ Trading wallet PK         │ (required)     │
// │ HYPERLIQUID_WALLET_ADDRESS │ Wallet address (optional) │ derived from PK│
// │ BOT_ENABLED                │ Master switch             │ false          │
// │ BOT_TESTNET                │ Use testnet               │ true           │
// │ BOT_ENTRY_APR              │ Entry threshold (decimal) │ 10 (1000%)     │
// │ BOT_EXIT_APR               │ Exit threshold (decimal)  │ 1 (100%)       │
// │ BOT_MAX_POSITION           │ Max $ per position        │ 100            │
// │ BOT_LEVERAGE               │ Default leverage          │ 3              │
// │ BOT_MAX_POSITIONS          │ Max concurrent positions  │ 3              │
// │ BOT_STOP_LOSS              │ Stop loss %               │ 5              │
// │ BOT_MAX_HOLD_HOURS         │ Force close after hours   │ 168            │
// └────────────────────────────┴───────────────────────────┴────────────────┘

import { NextRequest, NextResponse } from "next/server";
import { botTick } from "../../../services/tradingBot";
import * as journal from "../../../services/tradeJournal";

export var dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Auth check
  var secret = process.env.CRON_SECRET;
  if (secret) {
    var auth = req.headers.get("authorization") || "";
    if (auth !== "Bearer " + secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  var start = Date.now();

  try {
    var result = await botTick();
    var elapsed = ((Date.now() - start) / 1000).toFixed(1) + "s";

    var cfg = await journal.getConfig();
    var openPos = await journal.getOpenTrades();
    var allTrades = await journal.getAllTrades();

    return NextResponse.json({
      ok: true,
      elapsed: elapsed,
      config: {
        enabled: cfg.enabled,
        testnet: cfg.testnet,
        entryAPR: (cfg.entryAPR * 100).toFixed(0) + "%",
        exitAPR: (cfg.exitAPR * 100).toFixed(0) + "%",
        maxPosition: "$" + cfg.maxPositionUSD,
        leverage: cfg.leverage + "x",
        maxPositions: cfg.maxPositions,
      },
      scanned: result.scanned,
      opened: result.opened,
      closed: result.closed,
      skipped: result.skipped,
      errors: result.errors,
      openPositions: openPos.length,
      totalTrades: allTrades.length,
    });
  } catch (e: any) {
    journal.logAction("ERROR", "Tick failed: " + e.message);
    return NextResponse.json({
      ok: false,
      error: e.message,
      elapsed: ((Date.now() - start) / 1000).toFixed(1) + "s",
    }, { status: 500 });
  }
}
