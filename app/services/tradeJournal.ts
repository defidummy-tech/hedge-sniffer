// ═══ Persistent Trade Journal ═══
// Persists bot config and trades to:
//   1. Local filesystem (fast in-process reads)
//   2. Upstash Redis (survives server restarts / redeployments)
//
// On cold boot: pull from Redis → write to local files.
// On every write: update local files + async sync to Redis.
// Action log stays in-memory only (not critical).

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { BotTrade, BotConfig } from "../types";

// ── Storage paths ──
var DATA_DIR = process.env.BOT_DATA_DIR || "/tmp/hedge-sniffer";
var CONFIG_FILE = join(DATA_DIR, "bot-config.json");
var TRADES_FILE = join(DATA_DIR, "bot-trades.json");

try { mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { /* ok */ }

// ── Upstash Redis REST API ──
var REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || "";
var REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
var USE_REDIS = !!REDIS_URL && !!REDIS_TOKEN;

async function redisExec(cmd: string[]): Promise<any> {
  if (!USE_REDIS) return null;
  try {
    var res = await fetch(REDIS_URL, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + REDIS_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cmd),
    });
    var data = await res.json();
    return data.result;
  } catch (e) {
    console.error("Redis exec failed:", cmd[0], cmd[1], e);
    return null;
  }
}

async function redisGet(key: string): Promise<any> {
  var raw = await redisExec(["GET", key]);
  return raw ? JSON.parse(raw) : null;
}

async function redisSet(key: string, data: any): Promise<void> {
  await redisExec(["SET", key, JSON.stringify(data)]);
}

// ── Initialization (cold boot recovery from Redis) ──
var _initPromise: Promise<void> | null = null;

function ensureInit(): Promise<void> {
  if (!_initPromise) {
    _initPromise = doInit();
  }
  return _initPromise;
}

async function doInit(): Promise<void> {
  if (!USE_REDIS) return;

  try {
    // If local config file is missing, pull from Redis
    var localConfig = loadJSON(CONFIG_FILE);
    if (!localConfig) {
      var redisConfig = await redisGet("hedge:config");
      if (redisConfig) {
        saveJSON(CONFIG_FILE, redisConfig);
        console.log("[journal] Restored config from Redis");
      }
    }

    // If local trades file is missing, pull from Redis
    var localTrades = loadJSON(TRADES_FILE);
    if (!localTrades) {
      var redisTrades = await redisGet("hedge:trades");
      if (redisTrades) {
        saveJSON(TRADES_FILE, redisTrades);
        console.log("[journal] Restored " + redisTrades.length + " trades from Redis");
      }
    }
  } catch (e) {
    console.error("[journal] Redis init failed:", e);
  }
}

// ── Default config ──
// SAFETY: enabled always defaults to false. The bot can only be enabled
// through the UI (saved to Redis), never through env vars alone.
// This prevents the bot from auto-enabling on cold boot if Redis fails.
function defaultConfig(): BotConfig {
  return {
    enabled: false, // ALWAYS false by default — must be enabled via UI
    testnet: parseBool(process.env.BOT_TESTNET, true),
    entryAPR: parseFloat(process.env.BOT_ENTRY_APR || "0.5"),
    exitAPR: parseFloat(process.env.BOT_EXIT_APR || "0.5"),
    maxPositionUSD: parseFloat(process.env.BOT_MAX_POSITION || "100"),
    leverage: parseInt(process.env.BOT_LEVERAGE || "3"),
    maxPositions: parseInt(process.env.BOT_MAX_POSITIONS || "3"),
    stopLossPct: parseFloat(process.env.BOT_STOP_LOSS || "5"),
    maxHoldHours: parseFloat(process.env.BOT_MAX_HOLD_HOURS || "168"),
    fundingLockMinutes: parseFloat(process.env.BOT_FUNDING_LOCK_MINUTES || "10"),
    slCooldownHours: parseFloat(process.env.BOT_SL_COOLDOWN_HOURS || "24"),
    takeProfitPct: parseFloat(process.env.BOT_TAKE_PROFIT_PCT || "0"),
    trailingStopPct: parseFloat(process.env.BOT_TRAILING_STOP_PCT || "5"),
    minVolume: parseFloat(process.env.BOT_MIN_VOLUME || "0"),
    minOI: parseFloat(process.env.BOT_MIN_OI || "0"),
    maxDropPct: parseFloat(process.env.BOT_MAX_DROP_PCT || "3.5"),
    maxOIPct: parseFloat(process.env.BOT_MAX_OI_PCT || "0"),
    minHoldSettlements: parseInt(process.env.BOT_MIN_HOLD_SETTLEMENTS || "1"),
    reEntryCooldownHours: parseFloat(process.env.BOT_REENTRY_COOLDOWN_HOURS || "2"),
    entryWindowMinutes: parseInt(process.env.BOT_ENTRY_WINDOW_MINUTES || "30"),
    minFundingPersistHours: parseInt(process.env.BOT_MIN_FUNDING_PERSIST_HOURS || "2"),
    spotHedge: parseBool(process.env.BOT_SPOT_HEDGE, false),
    spotHedgeRatio: parseFloat(process.env.BOT_SPOT_HEDGE_RATIO || "1"),
    paperTrading: parseBool(process.env.BOT_PAPER_TRADING, false),
    paperBalance: parseFloat(process.env.BOT_PAPER_BALANCE || "10000"),
  };
}

function parseBool(v: string | undefined, fallback: boolean): boolean {
  if (!v) return fallback;
  return v === "true" || v === "1";
}

// ── Disk I/O (local cache — fast, synchronous) ──
function loadJSON(path: string): any {
  try {
    var raw = readFileSync(path, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function saveJSON(path: string, data: any): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error("tradeJournal saveJSON failed:", path, e);
  }
}

// Save to local file AND async sync to Redis
function saveAndSync(path: string, redisKey: string, data: any): void {
  saveJSON(path, data);
  if (USE_REDIS) {
    redisSet(redisKey, data).catch(function(e) {
      console.error("[journal] Redis sync failed (" + redisKey + "):", e);
    });
  }
}

// ── Action log (in-memory only, not critical) ──
var actions: Array<{ time: number; action: string; detail: string }> = [];

// ── Config ──

/** Merge saved config with defaults so new fields always get proper values */
function mergeWithDefaults(saved: any): BotConfig {
  var defaults = defaultConfig();
  var merged: any = {};
  for (var k in defaults) {
    if (saved && saved[k] !== undefined && saved[k] !== null) {
      merged[k] = saved[k];
    } else {
      merged[k] = (defaults as any)[k];
    }
  }
  // ── Config migrations ──
  // v1: entryAPR was set too high (18+), backtest shows 0.5 is optimal
  if (merged.entryAPR >= 18) {
    console.log("[journal] Migrating entryAPR from " + merged.entryAPR + " to " + defaults.entryAPR);
    merged.entryAPR = defaults.entryAPR;
  }
  // v2: trailing stop 3% was too tight (capped winners), backtest shows 5% is optimal
  if (saved && saved.trailingStopPct === 3) {
    console.log("[journal] Migrating trailingStopPct from 3 to 5");
    merged.trailingStopPct = 5;
  }
  // v3: exitAPR of 1.0 too high, backtest shows 0.5 is optimal
  if (saved && saved.exitAPR >= 1.0) {
    console.log("[journal] Migrating exitAPR from " + merged.exitAPR + " to " + defaults.exitAPR);
    merged.exitAPR = defaults.exitAPR;
  }
  return merged as BotConfig;
}

export async function getConfig(): Promise<BotConfig> {
  await ensureInit();

  // 1. Try local disk first (fast)
  var diskConfig = loadJSON(CONFIG_FILE);
  if (diskConfig) return mergeWithDefaults(diskConfig);

  // 2. Disk missing (cold boot) — try Redis directly
  if (USE_REDIS) {
    try {
      var redisConfig = await redisGet("hedge:config");
      if (redisConfig) {
        saveJSON(CONFIG_FILE, redisConfig); // cache locally
        console.log("[journal] Config recovered from Redis on getConfig()");
        return mergeWithDefaults(redisConfig);
      }
    } catch (e) {
      console.error("[journal] Redis config fetch failed in getConfig():", e);
    }
  }

  // 3. Both failed — use defaults (bot starts disabled by default)
  return defaultConfig();
}

export async function updateConfig(partial: Partial<BotConfig>): Promise<BotConfig> {
  await ensureInit();
  var current = await getConfig();
  for (var k in partial) {
    // Accept any key that exists in defaults (handles new fields)
    (current as any)[k] = (partial as any)[k];
  }
  saveAndSync(CONFIG_FILE, "hedge:config", current);
  return { ...current };
}

// ── Trades ──

export async function getAllTrades(): Promise<BotTrade[]> {
  await ensureInit();
  var diskTrades = loadJSON(TRADES_FILE);
  return Array.isArray(diskTrades) ? diskTrades : [];
}

export async function getOpenTrades(paperFilter?: boolean): Promise<BotTrade[]> {
  var all = await getAllTrades();
  return all.filter(function(t) {
    if (t.status !== "open") return false;
    if (paperFilter !== undefined) return !!t.paper === paperFilter;
    return true;
  });
}

export async function addTrade(trade: BotTrade): Promise<void> {
  await ensureInit();
  var trades = await getAllTrades();
  trades.push(trade);
  saveAndSync(TRADES_FILE, "hedge:trades", trades);
  logAction("OPEN", trade.coin + " " + trade.direction.toUpperCase() + " $" + trade.sizeUSD + " @ $" + trade.entryPrice.toFixed(2) + " (APR: " + (trade.entryFundingAPR * 100).toFixed(0) + "%)");
}

export async function closeTrade(tradeId: string, exitPrice: number, exitFundingAPR: number, exitReason: string, pnl: number, fundingEarned: number, spotExitPrice?: number): Promise<void> {
  await ensureInit();
  var trades = await getAllTrades();
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
  saveAndSync(TRADES_FILE, "hedge:trades", trades);
  logAction("CLOSE", trade.coin + " " + exitReason + " PnL: $" + pnl.toFixed(2) + " Funding: $" + fundingEarned.toFixed(4));
}

export async function isAlreadyOpen(coin: string, paperFilter?: boolean): Promise<boolean> {
  var open = await getOpenTrades(paperFilter);
  return open.some(function(t) { return t.coin === coin; });
}

export async function updateTradeFunding(tradeId: string, fundingDelta: number, newTimestamp: number): Promise<void> {
  await ensureInit();
  var trades = await getAllTrades();
  var trade = trades.find(function(t) { return t.id === tradeId; });
  if (!trade) return;
  trade.fundingEarned += fundingDelta;
  trade.totalReturn = trade.pnl + trade.fundingEarned;
  trade.lastFundingCheck = newTimestamp;
  saveAndSync(TRADES_FILE, "hedge:trades", trades);
}

export async function updateTradePnl(tradeId: string, unrealizedPnl: number): Promise<void> {
  await ensureInit();
  var trades = await getAllTrades();
  var trade = trades.find(function(t) { return t.id === tradeId; });
  if (!trade) return;
  trade.pnl = unrealizedPnl;
  trade.totalReturn = trade.pnl + trade.fundingEarned;
  saveAndSync(TRADES_FILE, "hedge:trades", trades);
}

export async function updateTradeStop(tradeId: string, newStop: number): Promise<void> {
  await ensureInit();
  var trades = await getAllTrades();
  var trade = trades.find(function(t) { return t.id === tradeId; });
  if (!trade) return;
  trade.stopPrice = newStop;
  saveAndSync(TRADES_FILE, "hedge:trades", trades);
}

// ── Action Log (in-memory only — not critical to persist) ──

export function logAction(action: string, detail: string): void {
  actions.unshift({ time: Date.now(), action: action, detail: detail });
  if (actions.length > 200) actions.length = 200;
}

export function getRecentActions(limit?: number): Array<{ time: number; action: string; detail: string }> {
  return actions.slice(0, limit || 50);
}
