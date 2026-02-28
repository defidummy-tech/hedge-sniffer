// ═══ In-Memory Trade Journal ═══
// Tracks all bot trades across cron ticks within the same server instance.
// Trades are lost on server restart — acceptable for v1; a DB can be added later.

import type { BotTrade, BotConfig } from "../types";

// ── In-memory stores ──
var trades: BotTrade[] = [];
var actions: Array<{ time: number; action: string; detail: string }> = [];

var config: BotConfig = {
  enabled: parseBool(process.env.BOT_ENABLED, false),
  testnet: parseBool(process.env.BOT_TESTNET, true),
  entryAPR: parseFloat(process.env.BOT_ENTRY_APR || "10"),       // 1000% APR
  exitAPR: parseFloat(process.env.BOT_EXIT_APR || "1"),           // 100% APR
  maxPositionUSD: parseFloat(process.env.BOT_MAX_POSITION || "100"),
  leverage: parseInt(process.env.BOT_LEVERAGE || "3"),
  maxPositions: parseInt(process.env.BOT_MAX_POSITIONS || "3"),
  stopLossPct: parseFloat(process.env.BOT_STOP_LOSS || "5"),
  maxHoldHours: parseFloat(process.env.BOT_MAX_HOLD_HOURS || "168"),
  spotHedge: parseBool(process.env.BOT_SPOT_HEDGE, false),
  spotHedgeRatio: parseFloat(process.env.BOT_SPOT_HEDGE_RATIO || "1"),
};

function parseBool(v: string | undefined, fallback: boolean): boolean {
  if (!v) return fallback;
  return v === "true" || v === "1";
}

// ── Config ──

export function getConfig(): BotConfig {
  return { ...config };
}

export function updateConfig(partial: Partial<BotConfig>): BotConfig {
  for (var k in partial) {
    if (k in config) {
      (config as any)[k] = (partial as any)[k];
    }
  }
  return { ...config };
}

// ── Trades ──

export function getAllTrades(): BotTrade[] {
  return trades.slice();
}

export function getOpenTrades(): BotTrade[] {
  return trades.filter(function(t) { return t.status === "open"; });
}

export function addTrade(trade: BotTrade): void {
  trades.push(trade);
  logAction("OPEN", trade.coin + " " + trade.direction.toUpperCase() + " $" + trade.sizeUSD + " @ $" + trade.entryPrice.toFixed(2) + " (APR: " + (trade.entryFundingAPR * 100).toFixed(0) + "%)");
}

export function closeTrade(tradeId: string, exitPrice: number, exitFundingAPR: number, exitReason: string, pnl: number, fundingEarned: number, spotExitPrice?: number): void {
  var trade = trades.find(function(t) { return t.id === tradeId; });
  if (!trade) return;
  trade.exitPrice = exitPrice;
  trade.exitTime = Date.now();
  trade.exitFundingAPR = exitFundingAPR;
  trade.exitReason = exitReason;
  trade.pnl = pnl;
  trade.fundingEarned = fundingEarned;
  trade.totalReturn = pnl + fundingEarned;
  trade.status = exitReason === "stop_loss" ? "stopped" : "closed";
  if (spotExitPrice !== undefined) trade.spotExitPrice = spotExitPrice;
  logAction("CLOSE", trade.coin + " " + exitReason + " PnL: $" + pnl.toFixed(2) + " Funding: $" + fundingEarned.toFixed(4));
}

export function isAlreadyOpen(coin: string): boolean {
  return trades.some(function(t) { return t.coin === coin && t.status === "open"; });
}

// ── Action Log ──

export function logAction(action: string, detail: string): void {
  actions.unshift({ time: Date.now(), action: action, detail: detail });
  // Keep last 200 entries
  if (actions.length > 200) actions.length = 200;
}

export function getRecentActions(limit?: number): Array<{ time: number; action: string; detail: string }> {
  return actions.slice(0, limit || 50);
}
