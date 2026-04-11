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
import type { BotTrade, BotConfig, TweetConfig } from "../types";

// ── Storage paths ──
var DATA_DIR = process.env.BOT_DATA_DIR || "/tmp/hedge-sniffer";
var CONFIG_FILE = join(DATA_DIR, "bot-config.json");
var TRADES_FILE = join(DATA_DIR, "bot-trades.json");
var TWEET_CONFIG_FILE = join(DATA_DIR, "tweet-config.json");

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

    // If local tweet config is missing, pull from Redis
    var localTweetConfig = loadJSON(TWEET_CONFIG_FILE);
    if (!localTweetConfig) {
      var redisTweetConfig = await redisGet("hedge:tweet-config");
      if (redisTweetConfig) {
        saveJSON(TWEET_CONFIG_FILE, redisTweetConfig);
        console.log("[journal] Restored tweet config from Redis");
      }
    }
  } catch (e) {
    console.error("[journal] Redis init failed:", e);
  }
}

// ── Default config ──
// enabled defaults to env var BOT_ENABLED (false if unset).
// testnet defaults to env var BOT_TESTNET (false if unset).
function defaultConfig(): BotConfig {
  return {
    enabled: parseBool(process.env.BOT_ENABLED, false),
    testnet: parseBool(process.env.BOT_TESTNET, false),
    entryAPR: parseFloat(process.env.BOT_ENTRY_APR || "0.5"),
    exitAPR: parseFloat(process.env.BOT_EXIT_APR || "0.5"),
    maxPositionUSD: parseFloat(process.env.BOT_MAX_POSITION || "100"),
    leverage: parseInt(process.env.BOT_LEVERAGE || "3"),
    maxPositions: parseInt(process.env.BOT_MAX_POSITIONS || "3"),
    stopLossPct: parseFloat(process.env.BOT_STOP_LOSS || "5"),
    maxHoldHours: parseFloat(process.env.BOT_MAX_HOLD_HOURS || "168"),
    fundingLockMinutes: parseFloat(process.env.BOT_FUNDING_LOCK_MINUTES || "10"),
    slCooldownHours: parseFloat(process.env.BOT_SL_COOLDOWN_HOURS || "48"),
    takeProfitPct: parseFloat(process.env.BOT_TAKE_PROFIT_PCT || "0"),
    trailingStopPct: parseFloat(process.env.BOT_TRAILING_STOP_PCT || "5"),
    minVolume: parseFloat(process.env.BOT_MIN_VOLUME || "0"),
    minOI: parseFloat(process.env.BOT_MIN_OI || "0"),
    maxDropPct: parseFloat(process.env.BOT_MAX_DROP_PCT || "3.5"),
    maxOIPct: parseFloat(process.env.BOT_MAX_OI_PCT || "0"),
    minHoldSettlements: parseInt(process.env.BOT_MIN_HOLD_SETTLEMENTS || "3"),
    reEntryCooldownHours: parseFloat(process.env.BOT_REENTRY_COOLDOWN_HOURS || "2"),
    entryWindowMinutes: parseInt(process.env.BOT_ENTRY_WINDOW_MINUTES || "30"),
    minFundingPersistHours: parseInt(process.env.BOT_MIN_FUNDING_PERSIST_HOURS || "2"),
    maxVolatilityPct: parseFloat(process.env.BOT_MAX_VOLATILITY_PCT || "5"),
    perCoinMaxLoss: parseFloat(process.env.BOT_PER_COIN_MAX_LOSS || "10"),
    coinBlacklist: (process.env.BOT_COIN_BLACKLIST || "").split(",").map(function(s) { return s.trim(); }).filter(Boolean),
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
  // ── Env var overrides for critical settings ──
  // testnet MUST always match the env var — a stale Redis value pointing to
  // testnet while the env says mainnet (or vice versa) is dangerous.
  if (process.env.BOT_TESTNET !== undefined) {
    merged.testnet = parseBool(process.env.BOT_TESTNET, false);
  }
  // enabled: env var override so Render BOT_ENABLED=true actually works
  // after a redeploy wipes the local config and Redis has stale data.
  if (process.env.BOT_ENABLED !== undefined) {
    merged.enabled = parseBool(process.env.BOT_ENABLED, false);
  }

  // ── Config migrations ──
  // v1: entryAPR was set too high (18+), migrate down to 1.0 (100%)
  if (merged.entryAPR >= 18) {
    console.log("[journal] Migrating entryAPR from " + merged.entryAPR + " to 1.0");
    merged.entryAPR = 1.0;
  }
  // v2: (removed) — backtest optimization now sets trailingStopPct=5 as optimal
  // v3: exitAPR of 1.0 too high, backtest shows 0.5 is optimal
  if (saved && saved.exitAPR >= 1.0) {
    console.log("[journal] Migrating exitAPR from " + merged.exitAPR + " to " + defaults.exitAPR);
    merged.exitAPR = defaults.exitAPR;
  }
  // v4: slCooldownHours 24h too short — repeat losses on same coins (0G 4x, AXS 3x)
  if (saved && saved.slCooldownHours != null && saved.slCooldownHours < 48) {
    console.log("[journal] Migrating slCooldownHours from " + merged.slCooldownHours + " to 48");
    merged.slCooldownHours = 48;
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

// ── Tweet Config ──

function defaultTweetConfig(): TweetConfig {
  return {
    enableHigh: false,
    enableSustained: false,
    enableDeals: false,
    extremeAPR: 9,
    highAPR: 5,
    sustainedAPR: 2,
    sustainedDays: 7,
    dealMinScore: 50,
    dealMinAPR: 0.5,
    cooldownHighHours: 4,
    cooldownSustainedHours: 24,
    cooldownDealHours: 8,
    globalCooldownMinutes: 30,
    maxTweetsPerRun: 1,
  };
}

function mergeWithTweetDefaults(partial: any): TweetConfig {
  var def = defaultTweetConfig();
  if (!partial || typeof partial !== "object") return def;
  for (var k in def) {
    if (partial[k] !== undefined) (def as any)[k] = partial[k];
  }
  return def;
}

export async function getTweetConfig(): Promise<TweetConfig> {
  await ensureInit();
  var diskConfig = loadJSON(TWEET_CONFIG_FILE);
  if (diskConfig) return mergeWithTweetDefaults(diskConfig);
  if (USE_REDIS) {
    try {
      var redisConfig = await redisGet("hedge:tweet-config");
      if (redisConfig) {
        saveJSON(TWEET_CONFIG_FILE, redisConfig);
        return mergeWithTweetDefaults(redisConfig);
      }
    } catch (e) { /* ok */ }
  }
  return defaultTweetConfig();
}

export async function updateTweetConfig(partial: Partial<TweetConfig>): Promise<TweetConfig> {
  await ensureInit();
  var current = await getTweetConfig();
  for (var k in partial) {
    (current as any)[k] = (partial as any)[k];
  }
  saveAndSync(TWEET_CONFIG_FILE, "hedge:tweet-config", current);
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

// Re-open a trade that was incorrectly closed (e.g., phantom cleanup on builder dex)
export async function reopenTrade(tradeId: string): Promise<boolean> {
  await ensureInit();
  var trades = await getAllTrades();
  var trade = trades.find(function(t) { return t.id === tradeId; });
  if (!trade) return false;
  trade.exitPrice = null;
  trade.exitTime = null;
  trade.exitFundingAPR = null;
  trade.exitReason = null;
  trade.pnl = 0;
  // Preserve fundingEarned — don't wipe accrued funding data on reopen
  // totalReturn = pnl + fundingEarned, recalculate from preserved funding
  trade.totalReturn = trade.fundingEarned || 0;
  trade.status = "open";
  saveAndSync(TRADES_FILE, "hedge:trades", trades);
  logAction("REOPEN", trade.coin + " re-opened (was incorrectly closed)");
  return true;
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

// Delete trades by ID (for cleaning up phantom/duplicate entries)
export async function deleteTrades(tradeIds: string[]): Promise<number> {
  await ensureInit();
  var trades = await getAllTrades();
  var before = trades.length;
  var idSet = new Set(tradeIds);
  trades = trades.filter(function(t) { return !idSet.has(t.id); });
  var removed = before - trades.length;
  if (removed > 0) {
    saveAndSync(TRADES_FILE, "hedge:trades", trades);
    logAction("CLEANUP", "Deleted " + removed + " phantom trade(s)");
  }
  return removed;
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
