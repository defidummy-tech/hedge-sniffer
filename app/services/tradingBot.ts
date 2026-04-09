// ═══ Trading Bot Engine ═══
// Connects to Hyperliquid via SDK, scans funding rates, opens/closes positions.

import { Hyperliquid } from "hyperliquid";
import { ethers } from "ethers";
import { encode } from "@msgpack/msgpack";
import { readFileSync } from "fs";
import type { BotTrade, BotConfig } from "../types";
import * as journal from "./tradeJournal";
import { sendAlert } from "./telegram";

// ── Read private key from env var OR Render secret file ──
function getPrivateKey(): string | null {
  // 1. Check env var first
  if (process.env.HYPERLIQUID_PRIVATE_KEY) {
    return process.env.HYPERLIQUID_PRIVATE_KEY.trim();
  }
  // 2. Check Render secret file (default path: /etc/secrets/<filename>)
  var secretPath = process.env.HYPERLIQUID_KEY_FILE || "/etc/secrets/hyperliquid_key.txt";
  try {
    var content = readFileSync(secretPath, "utf-8").trim();
    if (content) return content;
  } catch (e) {
    // File doesn't exist — that's fine
  }
  return null;
}

// ── Derive wallet address from private key ──
var cachedWalletAddress: string | null = null;

function getWalletAddress(): string {
  if (cachedWalletAddress) return cachedWalletAddress;
  var key = getPrivateKey();
  if (!key) throw new Error("No private key available");
  // Ensure key has 0x prefix for ethers
  var formattedKey = key.startsWith("0x") ? key : "0x" + key;
  var wallet = new ethers.Wallet(formattedKey);
  cachedWalletAddress = wallet.address;
  return cachedWalletAddress;
}

// ── SDK singleton (lazy init, re-creates if testnet setting changes) ──
var sdk: Hyperliquid | null = null;
var sdkReady = false;
var sdkTestnet: boolean | null = null;

async function getSDK(config: BotConfig): Promise<Hyperliquid> {
  var key = getPrivateKey();
  if (!key) throw new Error("No private key found (checked HYPERLIQUID_PRIVATE_KEY env var and /etc/secrets/hyperliquid_key.txt)");

  // Re-create SDK if testnet setting changed
  if (sdk && sdkTestnet !== null && sdkTestnet !== config.testnet) {
    journal.logAction("SDK", "Testnet changed " + sdkTestnet + " → " + config.testnet + " — re-initializing SDK");
    sdk = null;
    sdkReady = false;
  }

  if (!sdk) {
    sdk = new Hyperliquid({
      privateKey: key,
      testnet: config.testnet,
      enableWs: false,
    });
    await sdk.connect();
    sdkReady = true;
    sdkTestnet = config.testnet;
  }
  return sdk;
}

// ── Mainnet SDK singleton for paper trading reads ──
var mainnetSdk: Hyperliquid | null = null;

async function getMainnetSDK(): Promise<Hyperliquid> {
  if (!mainnetSdk) {
    var key = getPrivateKey();
    if (!key) throw new Error("No private key for mainnet SDK init");
    mainnetSdk = new Hyperliquid({
      privateKey: key,
      testnet: false, // always mainnet for paper mode reads
      enableWs: false,
    });
    await mainnetSdk.connect();
  }
  return mainnetSdk;
}

async function getReadSDK(config: BotConfig): Promise<Hyperliquid> {
  if (config.paperTrading) return getMainnetSDK();
  return getSDK(config);
}

// ── Generate unique trade ID ──
function genId(): string {
  return "t_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
}

// ── Ensure coin has -PERP suffix for exchange.placeOrder (SDK may already include it) ──
function toPerpCoin(coin: string): string {
  return coin.endsWith("-PERP") ? coin : coin + "-PERP";
}

// ── Raw Hyperliquid info API helper (for multi-dex queries the SDK doesn't support) ──
// Builder dexes only exist on mainnet, so always use mainnet endpoint.
var HL_INFO_URL = "https://api.hyperliquid.xyz/info";

async function hlInfoPost(body: any): Promise<any> {
  var res = await fetch(HL_INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("HL API " + res.status);
  return res.json();
}

// ── Builder dex asset index resolution ──
// Asset ID = 100000 + perp_dex_index * 10000 + index_in_meta
// See: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids
var builderDexIndexCache: Record<string, number> | null = null;
var builderDexCacheTime = 0;
var BUILDER_DEX_CACHE_TTL = 3600000; // 1 hour

async function getBuilderDexAssetIndex(coin: string): Promise<number> {
  // coin format: "xyz:xyz:CL" → dex="xyz", internal name in universe="xyz:CL"
  // or "flx:flx:OIL" → dex="flx", internal name="flx:OIL"
  var now = Date.now();
  if (!builderDexIndexCache || now - builderDexCacheTime > BUILDER_DEX_CACHE_TTL) {
    builderDexIndexCache = {};
    builderDexCacheTime = now;
    try {
      var dexes: Array<any> = await hlInfoPost({ type: "perpDexs" });
      for (var dexIdx = 0; dexIdx < dexes.length; dexIdx++) {
        var dex = dexes[dexIdx];
        if (!dex || !dex.name) continue; // index 0 is null (main dex)
        try {
          var dexMeta = await hlInfoPost({ type: "meta", dex: dex.name });
          if (dexMeta && dexMeta.universe) {
            dexMeta.universe.forEach(function(u: any, assetIdx: number) {
              // u.name is like "xyz:CL", full coin key is "xyz:xyz:CL"
              var fullKey = dex.name + ":" + u.name;
              builderDexIndexCache![fullKey] = 100000 + dexIdx * 10000 + assetIdx;
            });
          }
        } catch (e: any) {
          // skip failed dex
        }
      }
      journal.logAction("CACHE", "Builder dex index cache loaded: " + Object.keys(builderDexIndexCache).length + " assets");
    } catch (e: any) {
      journal.logAction("ERROR", "Builder dex index cache failed: " + e.message);
    }
  }
  var idx = builderDexIndexCache[coin];
  if (idx === undefined) throw new Error("Builder dex asset not found: " + coin);
  return idx;
}

// ── Raw signed order placement for builder dex coins ──
// The SDK doesn't support builder dex asset indices, so we bypass it entirely.
var HL_EXCHANGE_URL = "https://api.hyperliquid.xyz/exchange";

function floatToWire(x: number): string {
  var s = x.toPrecision(5);
  // Remove trailing zeros after decimal
  if (s.indexOf(".") !== -1) {
    s = s.replace(/0+$/, "").replace(/\.$/, "");
  }
  return s;
}

function actionHash(action: any, vaultAddress: string | null, nonce: number): Uint8Array {
  var msgPackBytes = encode(action);
  var additionalBytesLength = vaultAddress === null ? 9 : 29;
  var data = new Uint8Array(msgPackBytes.length + additionalBytesLength);
  data.set(msgPackBytes);
  var view = new DataView(data.buffer);
  view.setBigUint64(msgPackBytes.length, BigInt(nonce), false);
  if (vaultAddress === null) {
    view.setUint8(msgPackBytes.length + 8, 0);
  } else {
    view.setUint8(msgPackBytes.length + 8, 1);
    data.set(ethers.getBytes(vaultAddress), msgPackBytes.length + 9);
  }
  return ethers.getBytes(ethers.keccak256(data));
}

async function signL1ActionRaw(wallet: ethers.Wallet, action: any, nonce: number): Promise<{ r: string; s: string; v: number }> {
  var hash = actionHash(action, null, nonce);
  var phantomAgent = { source: "a", connectionId: ethers.hexlify(hash) };
  var domain = { name: "Exchange", version: "1", chainId: 1337, verifyingContract: "0x0000000000000000000000000000000000000000" };
  var types = { Agent: [{ name: "source", type: "string" }, { name: "connectionId", type: "bytes32" }] };
  var sig = await wallet.signTypedData(domain, types, phantomAgent);
  var split = ethers.Signature.from(sig);
  return { r: split.r, s: split.s, v: split.v };
}

async function builderDexPlaceOrder(opts: {
  coin: string;      // full coin like "xyz:xyz:CL"
  isBuy: boolean;
  size: number;
  price: number;
  reduceOnly: boolean;
  szDecimals: number;
}): Promise<any> {
  var key = getPrivateKey();
  if (!key) throw new Error("No private key for builder dex order");
  var wallet = new ethers.Wallet(key);

  var assetIndex = await getBuilderDexAssetIndex(opts.coin);

  var orderWire = {
    a: assetIndex,
    b: opts.isBuy,
    p: floatToWire(opts.price),
    s: floatToWire(opts.size),
    r: opts.reduceOnly,
    t: { limit: { tif: "Ioc" } },
  };

  var action = {
    type: "order",
    orders: [orderWire],
    grouping: "na",
  };

  var nonce = Date.now() + 2000 + Math.floor(Math.random() * 1000);
  var signature = await signL1ActionRaw(wallet, action, nonce);
  var payload = { action: action, nonce: nonce, signature: signature, vaultAddress: null };

  var res = await fetch(HL_EXCHANGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  var json = await res.json();
  if (!res.ok) throw new Error("Builder dex order failed: " + JSON.stringify(json));
  return json;
}

async function builderDexUpdateLeverage(coin: string, leverage: number): Promise<any> {
  var key = getPrivateKey();
  if (!key) throw new Error("No private key for builder dex leverage");
  var wallet = new ethers.Wallet(key);

  var assetIndex = await getBuilderDexAssetIndex(coin);
  journal.logAction("LEV", coin + " setting leverage " + leverage + "x (asset index: " + assetIndex + ")");

  // Builder dex perps typically use isolated margin
  var action = {
    type: "updateLeverage",
    asset: assetIndex,
    isCross: false,
    leverage: leverage,
  };

  // Use unique nonce to avoid collisions with order placement
  var nonce = Date.now() + Math.floor(Math.random() * 1000);
  var signature = await signL1ActionRaw(wallet, action, nonce);
  var payload = { action: action, nonce: nonce, signature: signature, vaultAddress: null };

  var res = await fetch(HL_EXCHANGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  var json = await res.json();
  journal.logAction("LEV", coin + " leverage response (HTTP " + res.status + "): " + JSON.stringify(json).slice(0, 300));

  // If response is null or error, throw so the bot doesn't open a position with wrong leverage
  if (!json || json.status === "err") {
    throw new Error("Builder dex leverage failed: " + (json ? json.response : "null response"));
  }
  return json;
}

// ── Discover all builder dexes and return their universe+funding ──
async function fetchBuilderDexOpportunities(): Promise<Array<{
  coin: string; dex: string; fundingRate: number; fundingAPR: number;
  midPrice: number; maxLev: number; szDecimals: number; volume: number; openInterest: number;
}>> {
  var results: Array<{
    coin: string; dex: string; fundingRate: number; fundingAPR: number;
    midPrice: number; maxLev: number; szDecimals: number; volume: number; openInterest: number;
  }> = [];

  try {
    var dexes: Array<{ name: string }> = await hlInfoPost({ type: "perpDexs" });
    if (!Array.isArray(dexes) || dexes.length === 0) return results;

    var dexResults = await Promise.allSettled(
      dexes.map(async function(dex) {
        var dexMeta = await hlInfoPost({ type: "metaAndAssetCtxs", dex: dex.name });
        return { dexName: dex.name, meta: dexMeta[0], ctxs: dexMeta[1] };
      })
    );

    for (var dr of dexResults) {
      if (dr.status !== "fulfilled") continue;
      var dexData = dr.value;
      if (!dexData.meta || !dexData.meta.universe) continue;

      dexData.meta.universe.forEach(function(u: any, i: number) {
        var ctx = dexData.ctxs[i];
        if (!ctx) return;
        var rate = parseFloat(ctx.funding || "0");
        var mid = parseFloat(ctx.midPx || ctx.markPx || "0");
        if (mid <= 0) return;
        var fullCoin = dexData.dexName + ":" + u.name;
        results.push({
          coin: fullCoin,
          dex: dexData.dexName,
          fundingRate: rate,
          fundingAPR: rate * 8760,
          midPrice: mid,
          maxLev: u.maxLeverage || 3,
          szDecimals: u.szDecimals || 0,
          volume: parseFloat(ctx.dayNtlVlm || "0"),
          openInterest: parseFloat(ctx.openInterest || "0"),
        });
      });
    }
  } catch (e: any) {
    // Non-critical: builder dex discovery failed, main dex still works
  }

  return results;
}

// ── Fetch funding rates for builder-dex coins that have open trades ──
async function fetchBuilderDexFunding(coins: string[]): Promise<{ fundingMap: Record<string, number>; mids: Record<string, string> }> {
  var fundingMap: Record<string, number> = {};
  var mids: Record<string, string> = {};

  // Group by dex prefix
  var dexGroups: Record<string, string[]> = {};
  for (var c of coins) {
    var colonIdx = c.indexOf(":");
    if (colonIdx === -1) continue;
    var dexName = c.substring(0, colonIdx);
    if (!dexGroups[dexName]) dexGroups[dexName] = [];
    dexGroups[dexName].push(c);
  }

  var dexNames = Object.keys(dexGroups);
  if (dexNames.length === 0) return { fundingMap: fundingMap, mids: mids };

  var dexResults = await Promise.allSettled(
    dexNames.map(async function(dex) {
      var dexMeta = await hlInfoPost({ type: "metaAndAssetCtxs", dex: dex });
      var dexMids = await hlInfoPost({ type: "allMids", dex: dex });
      return { dexName: dex, meta: dexMeta[0], ctxs: dexMeta[1], mids: dexMids };
    })
  );

  for (var dr of dexResults) {
    if (dr.status !== "fulfilled") continue;
    var data = dr.value;
    if (data.meta && data.meta.universe) {
      data.meta.universe.forEach(function(u: any, i: number) {
        var ctx = data.ctxs[i];
        if (ctx && ctx.funding) {
          fundingMap[data.dexName + ":" + u.name] = parseFloat(ctx.funding) * 8760;
        }
      });
    }
    if (data.mids) {
      for (var coin in data.mids) {
        mids[data.dexName + ":" + coin] = data.mids[coin];
      }
    }
  }

  return { fundingMap: fundingMap, mids: mids };
}

// ── Fetch ALL live positions including builder dex positions ──
// Returns a map of journalCoinName → position data
async function fetchAllLivePositions(walletAddr: string): Promise<{
  coins: Set<string>;
  positions: Array<{ coin: string; szi: string; entryPx: string; unrealizedPnl: string; leverage: number; cumFunding: string }>;
}> {
  var coins = new Set<string>();
  var positions: Array<{ coin: string; szi: string; entryPx: string; unrealizedPnl: string; leverage: number; cumFunding: string }> = [];

  // 1) Main dex positions (via raw API to avoid SDK issues)
  try {
    var mainState = await hlInfoPost({ type: "clearinghouseState", user: walletAddr });
    if (mainState && Array.isArray(mainState.assetPositions)) {
      for (var mp of mainState.assetPositions) {
        if (parseFloat(mp.position.szi) === 0) continue;
        var mainCoin = mp.position.coin;
        coins.add(mainCoin);
        positions.push({
          coin: mainCoin,
          szi: mp.position.szi,
          entryPx: mp.position.entryPx,
          unrealizedPnl: mp.position.unrealizedPnl,
          leverage: mp.position.leverage ? mp.position.leverage.value : 1,
          cumFunding: mp.position.cumFunding ? mp.position.cumFunding.sinceOpen : "0",
        });
      }
    }
  } catch (e: any) {
    journal.logAction("WARN", "Failed to fetch main dex positions: " + e.message);
  }

  // 2) Builder dex positions
  try {
    var dexes: Array<{ name: string }> = await hlInfoPost({ type: "perpDexs" });
    if (Array.isArray(dexes)) {
      var dexQueries = dexes
        .filter(function(d) { return d && d.name; })
        .map(async function(dex) {
          try {
            var dexState = await hlInfoPost({ type: "clearinghouseState", user: walletAddr, dex: dex.name });
            if (dexState && Array.isArray(dexState.assetPositions)) {
              for (var dp of dexState.assetPositions) {
                if (parseFloat(dp.position.szi) === 0) continue;
                // Builder dex coin in our journal = dexName + ":" + position.coin
                var fullCoin = dex.name + ":" + dp.position.coin;
                coins.add(fullCoin);
                positions.push({
                  coin: fullCoin,
                  szi: dp.position.szi,
                  entryPx: dp.position.entryPx,
                  unrealizedPnl: dp.position.unrealizedPnl,
                  leverage: dp.position.leverage ? dp.position.leverage.value : 1,
                  cumFunding: dp.position.cumFunding ? dp.position.cumFunding.sinceOpen : "0",
                });
              }
            }
          } catch (e: any) {
            // Individual dex query failure is non-critical
          }
        });
      await Promise.allSettled(dexQueries);
    }
  } catch (e: any) {
    journal.logAction("WARN", "Failed to fetch builder dex positions: " + e.message);
  }

  return { coins: coins, positions: positions };
}

// ── Check if a coin is in stop-loss cooldown ──
async function isInSLCooldown(coin: string, cooldownHours: number): Promise<boolean> {
  if (cooldownHours <= 0) return false;
  var trades = await journal.getAllTrades();
  var cooldownMs = cooldownHours * 3600000;
  var now = Date.now();
  for (var i = trades.length - 1; i >= 0; i--) {
    var t = trades[i];
    if (t.coin === coin && t.exitReason === "stop_loss" && t.exitTime) {
      if (now - t.exitTime < cooldownMs) return true;
    }
  }
  return false;
}

// ── Per-coin loss memory: count SL exits in a rolling window ──
async function recentSLCount(coin: string, windowHours: number): Promise<number> {
  var trades = await journal.getAllTrades();
  var windowMs = windowHours * 3600000;
  var now = Date.now();
  var count = 0;
  for (var i = trades.length - 1; i >= 0; i--) {
    var t = trades[i];
    if (t.exitTime && now - t.exitTime > windowMs) break; // trades are chronological
    if (t.coin === coin && t.exitReason === "stop_loss" && t.exitTime) {
      if (now - t.exitTime < windowMs) count++;
    }
  }
  return count;
}

// ── Per-coin cumulative loss in rolling 24h window ──
async function getCoinLoss24h(coin: string): Promise<number> {
  var trades = await journal.getAllTrades();
  var windowMs = 24 * 3600000;
  var now = Date.now();
  var totalLoss = 0;
  for (var i = trades.length - 1; i >= 0; i--) {
    var t = trades[i];
    if (t.exitTime && now - t.exitTime > windowMs) break;
    if (t.coin === coin && t.exitTime && t.totalReturn < 0) {
      if (now - t.exitTime < windowMs) {
        totalLoss += Math.abs(t.totalReturn);
      }
    }
  }
  return totalLoss;
}

// ── Stale price detection: check if a coin's price has changed recently ──
// Compares current mid against recent trade entry/exit prices — if identical, market is frozen
async function isPriceStale(coin: string, currentMid: number): Promise<boolean> {
  var trades = await journal.getAllTrades();
  var matchCount = 0;
  var recentTradeCount = 0;
  // Look at last 5 trades for this coin
  for (var i = trades.length - 1; i >= 0; i--) {
    var t = trades[i];
    if (t.coin !== coin) continue;
    recentTradeCount++;
    // Check if entry AND exit prices match previous trades exactly (frozen market)
    if (t.entryPrice === currentMid || (t.exitPrice !== null && Math.abs(t.exitPrice - currentMid) < currentMid * 0.0001)) {
      matchCount++;
    }
    if (recentTradeCount >= 3) break;
  }
  // If 2+ of last 3 trades had identical prices, market is stale
  return matchCount >= 2;
}

// ── General re-entry cooldown: wait N hours after ANY exit on same coin ──
async function isInReEntryCooldown(coin: string, cooldownHours: number): Promise<boolean> {
  if (cooldownHours <= 0) return false;
  var trades = await journal.getAllTrades();
  var cooldownMs = cooldownHours * 3600000;
  var now = Date.now();
  for (var i = trades.length - 1; i >= 0; i--) {
    var t = trades[i];
    if (t.coin === coin && t.exitTime && t.status !== "open") {
      if (now - t.exitTime < cooldownMs) return true;
    }
  }
  return false;
}

// ── Check if funding has persisted above entry threshold for N consecutive hours ──
// Uses Hyperliquid's fundingHistory API to look back N hours
async function isFundingPersistent(coin: string, entryAPR: number, persistHours: number): Promise<boolean> {
  if (persistHours <= 0) return true; // disabled
  try {
    var startTime = Date.now() - persistHours * 3600000;
    // For builder-dex coins, strip the dex prefix for the API call
    var apiCoin = coin;
    var dexParam: string | undefined;
    var colonIdx = coin.indexOf(":");
    if (colonIdx !== -1) {
      dexParam = coin.substring(0, colonIdx);
      apiCoin = coin.substring(colonIdx + 1);
    }
    var body: any = { type: "fundingHistory", coin: apiCoin, startTime: startTime };
    if (dexParam) body.dex = dexParam;
    var history: Array<{ time: number; coin: string; fundingRate: string }> = await hlInfoPost(body);
    if (!Array.isArray(history) || history.length === 0) return false;

    // Check that ALL data points have |APR| >= entryAPR
    var minAbsAPR = entryAPR; // e.g. 0.10 = 10%
    for (var h of history) {
      var hourlyRate = parseFloat(h.fundingRate);
      var absAPR = Math.abs(hourlyRate * 8760);
      if (absAPR < minAbsAPR) return false;
    }
    // Also need at least persistHours worth of data points (1 per hour)
    return history.length >= persistHours;
  } catch (e: any) {
    // Fail-closed: if we can't verify funding is persistent, skip the entry.
    // This prevents entering on brief funding spikes (especially builder dex coins).
    journal.logAction("WARN", "Funding persistence check failed for " + coin + ": " + e.message + " — skipping entry");
    return false;
  }
}

// ── Count how many hourly settlements have occurred since entry ──
function countSettlementsSince(entryTime: number): number {
  // Funding settles every hour at :00 UTC
  // Count how many :00 boundaries have passed since entry
  var entryHour = Math.ceil(entryTime / 3600000); // ms -> hour boundary (rounded up)
  var nowHour = Math.floor(Date.now() / 3600000);  // ms -> hour boundary (rounded down)
  return Math.max(0, nowHour - entryHour);
}

// ── Get recent volatility (ATR-like) from 1h candles ──
// Returns the average true range as a % of price over last 4 hours
async function getRecentVolatility(coin: string): Promise<number> {
  try {
    var now = Date.now();
    var fourHoursAgo = now - 4 * 3600000;
    var candleData = await hlInfoPost({
      type: "candleSnapshot",
      req: { coin: coin, interval: "1h", startTime: fourHoursAgo, endTime: now },
    });
    if (!Array.isArray(candleData) || candleData.length === 0) return 0;
    var totalRange = 0;
    var avgPrice = 0;
    for (var c of candleData) {
      var high = parseFloat(c.h || "0");
      var low = parseFloat(c.l || "0");
      var mid = (high + low) / 2;
      if (mid > 0) {
        totalRange += (high - low) / mid;
        avgPrice++;
      }
    }
    return avgPrice > 0 ? (totalRange / avgPrice) * 100 : 0; // return as %
  } catch (e) {
    return 0;
  }
}

// ── Check recent price drop (last 4h) using Hyperliquid candle API ──
async function getRecentPriceDrop(coin: string, currentPrice: number): Promise<number> {
  try {
    // Fetch 4h candles for the last 4 hours
    var now = Date.now();
    var fourHoursAgo = now - 4 * 3600000;
    var candleData = await hlInfoPost({
      type: "candleSnapshot",
      req: {
        coin: coin,
        interval: "1h",
        startTime: fourHoursAgo,
        endTime: now,
      },
    });

    if (!Array.isArray(candleData) || candleData.length === 0) return 0;

    // Find the highest price in the 4h window
    var highPrice = 0;
    for (var c of candleData) {
      var h = parseFloat(c.h || "0");
      if (h > highPrice) highPrice = h;
    }

    if (highPrice <= 0) return 0;

    // Calculate % drop from high to current
    var dropPct = ((highPrice - currentPrice) / highPrice) * 100;
    return Math.max(0, dropPct); // Only return positive drops
  } catch (e) {
    return 0; // If candle fetch fails, return 0 (no drop detected)
  }
}

// ── Check recent price rise (last 4h) using Hyperliquid candle API ──
// Used for short entries: skip if price pumped too much (momentum against short)
async function getRecentPriceRise(coin: string, currentPrice: number): Promise<number> {
  try {
    var now = Date.now();
    var fourHoursAgo = now - 4 * 3600000;
    var candleData = await hlInfoPost({
      type: "candleSnapshot",
      req: { coin: coin, interval: "1h", startTime: fourHoursAgo, endTime: now },
    });
    if (!Array.isArray(candleData) || candleData.length === 0) return 0;
    var lowPrice = Infinity;
    for (var c of candleData) {
      var l = parseFloat(c.l || "0");
      if (l > 0 && l < lowPrice) lowPrice = l;
    }
    if (lowPrice <= 0 || lowPrice === Infinity) return 0;
    var risePct = ((currentPrice - lowPrice) / lowPrice) * 100;
    return Math.max(0, risePct);
  } catch (e) {
    return 0;
  }
}

// ── Spot hedge helpers ──
// Hyperliquid spot tokens use @{index} format where index = 10000 + asset index
// The spot coin name is typically the same as perp name but with different routing

async function getSpotMidPrice(hl: Hyperliquid, coin: string): Promise<number> {
  try {
    // Fetch spot meta to find the asset index
    var spotMeta: any = await hlInfoPost({ type: "spotMeta" });
    if (!spotMeta || !spotMeta.tokens) return 0;
    var token = spotMeta.tokens.find(function(t: any) { return t.name === coin; });
    if (!token) return 0;

    var spotCtx: any = await hlInfoPost({ type: "spotMetaAndAssetCtxs" });
    if (!spotCtx || !Array.isArray(spotCtx) || spotCtx.length < 2) return 0;
    var spotAssets = spotCtx[0].tokens || [];
    var spotCtxs = spotCtx[1] || [];

    for (var i = 0; i < spotAssets.length; i++) {
      if (spotAssets[i].name === coin && spotCtxs[i]) {
        var mid = parseFloat(spotCtxs[i].midPx || "0");
        if (mid > 0) return mid;
      }
    }
    return 0;
  } catch (e: any) {
    return 0;
  }
}

async function placeSpotHedge(hl: Hyperliquid, coin: string, sizeUSD: number, perpDirection: "long" | "short", isClose: boolean): Promise<{ price: number; filled: boolean }> {
  // Spot hedge is opposite of perp direction:
  // If perp is SHORT (earning funding), buy spot to delta-neutralize
  // If perp is LONG (earning funding), sell spot (need to already hold it)
  // On close: reverse the hedge
  try {
    var spotPrice = await getSpotMidPrice(hl, coin);
    if (spotPrice <= 0) return { price: 0, filled: false };

    var spotSize = sizeUSD / spotPrice;
    // Opening hedge: buy spot if perp short, sell spot if perp long
    // Closing hedge: sell spot if perp was short, buy spot if perp was long
    var isBuySpot = perpDirection === "short" ? !isClose : isClose;

    var limitPx = roundPx(isBuySpot ? spotPrice * 1.02 : spotPrice * 0.98); // 2% slippage buffer

    // Find spot asset index
    var spotMeta: any = await hlInfoPost({ type: "spotMeta" });
    if (!spotMeta || !spotMeta.tokens) return { price: 0, filled: false };
    var tokenInfo = spotMeta.tokens.find(function(t: any) { return t.name === coin; });
    if (!tokenInfo) return { price: 0, filled: false };

    var spotCoin = coin + "-SPOT";
    var result = await hl.exchange.placeOrder({
      coin: spotCoin,
      is_buy: isBuySpot,
      sz: parseFloat(spotSize.toFixed(6)),
      limit_px: limitPx,
      order_type: { limit: { tif: "Ioc" as any } },
      reduce_only: false,
    });

    var filled = false;
    var fillPx = 0;
    if (result && result.response && result.response.data && result.response.data.statuses) {
      var s = result.response.data.statuses[0];
      if (s && s.filled) {
        filled = true;
        fillPx = parseFloat(s.filled.avgPx);
      }
    }

    return { price: fillPx || spotPrice, filled: filled };
  } catch (e: any) {
    journal.logAction("WARN", "Spot hedge " + (isClose ? "close" : "open") + " " + coin + " failed: " + e.message);
    return { price: 0, filled: false };
  }
}

// ── Round a number to N significant figures (Hyperliquid requires ≤5 sig figs for prices) ──
function roundSigFigs(num: number, sigFigs: number = 5): number {
  if (num === 0) return 0;
  var d = Math.ceil(Math.log10(Math.abs(num)));
  var power = sigFigs - d;
  var magnitude = Math.pow(10, power);
  return Math.round(num * magnitude) / magnitude;
}

// ── Round price for Hyperliquid exchange: ≤5 sig figs AND ≤5 decimal places ──
// The exchange rejects prices with >5 decimal places (e.g. 0.013002 has 6 → rejected).
// roundSigFigs alone doesn't cap decimal places for small prices.
function roundPx(price: number): number {
  var r = roundSigFigs(price, 5);
  return parseFloat(r.toFixed(5));
}

// ── Minutes until next funding settlement (Hyperliquid settles every hour on the hour) ──
function minutesUntilFundingSettlement(): number {
  var now = new Date();
  return 60 - now.getUTCMinutes();
}

// ── Format price for display (handles tiny tokens like $0.003) ──
function fmtPx(p: number): string {
  if (p === 0) return "0";
  if (p >= 100) return p.toFixed(2);
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(6);
  return p.toPrecision(4);
}

// ── Close ALL open positions on Hyperliquid ──
export async function closeAllPositions(): Promise<{ closed: string[]; errors: string[] }> {
  var config = await journal.getConfig();
  var closed: string[] = [];
  var errors: string[] = [];

  // Paper mode: close simulated positions only
  if (config.paperTrading) {
    return closeAllPaperPositions();
  }

  if (!getPrivateKey()) {
    errors.push("No private key");
    return { closed: closed, errors: errors };
  }

  try {
    var hl = await getSDK(config);
    var walletAddr = getWalletAddress();

    // Get ALL live positions including builder dex
    var live = await fetchAllLivePositions(walletAddr);

    journal.logAction("KILL", "Found " + live.positions.length + " live position(s) to close");

    // Get mid prices for manual close fallback
    var mids = await hl.info.getAllMids();

    // Also fetch builder-dex mids
    var bdCoins = live.positions.filter(function(p) { return p.coin.indexOf(":") !== -1; }).map(function(p) { return p.coin; });
    if (bdCoins.length > 0) {
      try {
        var bdMids = await fetchBuilderDexFunding(bdCoins);
        for (var bmk in bdMids.mids) mids[bmk] = bdMids.mids[bmk];
      } catch (e: any) { /* non-critical */ }
    }

    for (var pos of live.positions) {
      var coin = pos.coin;
      var szi = parseFloat(pos.szi);
      var closeSize = Math.abs(szi);
      var isBuy = szi < 0; // if short (negative size), buy to close
      var isBuilderDexCoin = coin.indexOf(":") !== -1;
      try {
        if (isBuilderDexCoin) {
          // Builder dex: use raw API to close
          var bdMidPrice = parseFloat(mids[coin] || "0");
          if (bdMidPrice <= 0) throw new Error("No mid price for builder dex coin " + coin);
          var bdLimitPrice = roundPx(isBuy ? bdMidPrice * 1.05 : bdMidPrice * 0.95);
          await builderDexPlaceOrder({
            coin: coin,
            isBuy: isBuy,
            size: closeSize,
            price: bdLimitPrice,
            reduceOnly: true,
            szDecimals: 4,
          });
          closed.push(coin);
          journal.logAction("KILL", "Closed " + coin + " (builder dex)");
        } else {
          await hl.custom.marketClose(coin);
          closed.push(coin);
          journal.logAction("KILL", "Closed " + coin);
        }
      } catch (e: any) {
        journal.logAction("WARN", "Close " + coin + " failed: " + e.message + " — trying manual close");

        // Fallback: manual close using exchange.placeOrder directly
        // This bypasses the SDK's internal symbol matching which can fail for some coins (e.g. ETH)
        try {
          var midPrice = parseFloat(mids[coin] || "0");
          if (midPrice <= 0) throw new Error("No mid price for " + coin);

          var limitPrice = roundPx(isBuy ? midPrice * 1.05 : midPrice * 0.95);

          if (isBuilderDexCoin) {
            await builderDexPlaceOrder({
              coin: coin,
              isBuy: isBuy,
              size: closeSize,
              price: limitPrice,
              reduceOnly: true,
              szDecimals: 4,
            });
          } else {
            await hl.exchange.placeOrder({
              coin: toPerpCoin(coin),
              is_buy: isBuy,
              sz: closeSize,
              limit_px: limitPrice,
              order_type: { limit: { tif: "Ioc" as any } },
              reduce_only: true,
            });
          }

          closed.push(coin);
          journal.logAction("KILL", "Closed " + coin + " (manual fallback)");
        } catch (e2: any) {
          errors.push(coin + ": " + e2.message);
          journal.logAction("ERROR", "Manual close " + coin + " also failed: " + e2.message);
        }
      }
    }
  } catch (e: any) {
    errors.push("SDK error: " + e.message);
    journal.logAction("ERROR", "Kill switch SDK: " + e.message);
  }

  // Telegram alert for kill switch
  if (closed.length > 0 || errors.length > 0) {
    sendAlert("\uD83D\uDC80", "KILL SWITCH", [
      "Closed: " + (closed.length > 0 ? closed.join(", ") : "none"),
      errors.length > 0 ? "Errors: " + errors.join(", ") : "",
    ].filter(Boolean)).catch(function() {});
  }

  return { closed: closed, errors: errors };
}

// ── Close all paper positions (simulated kill switch) ──
async function closeAllPaperPositions(): Promise<{ closed: string[]; errors: string[] }> {
  var closed: string[] = [];
  var errors: string[] = [];

  try {
    var hl = await getMainnetSDK();
    var mids = await hl.info.getAllMids();
    var openTrades = await journal.getOpenTrades(true); // paper only

    // Fetch builder-dex mids for any paper trades on non-main dexes
    var builderCoins = openTrades.filter(function(t) { return t.coin.indexOf(":") !== -1; }).map(function(t) { return t.coin; });
    if (builderCoins.length > 0) {
      try {
        var bdData = await fetchBuilderDexFunding(builderCoins);
        for (var bk in bdData.mids) mids[bk] = bdData.mids[bk];
      } catch (e: any) { /* non-critical */ }
    }

    for (var trade of openTrades) {
      try {
        var midPrice = mids[trade.coin] ? parseFloat(mids[trade.coin]) : trade.entryPrice;
        var notional = trade.sizeUSD * trade.leverage;
        var priceChange = (midPrice - trade.entryPrice) / trade.entryPrice;
        var unrealizedPnl = trade.direction === "long"
          ? notional * priceChange
          : notional * (-priceChange);

        await journal.closeTrade(trade.id, midPrice, 0, "kill_switch", unrealizedPnl, trade.fundingEarned);
        closed.push(trade.coin);
        journal.logAction("KILL", "[PAPER] Closed " + trade.coin);
      } catch (e: any) {
        errors.push(trade.coin + ": " + e.message);
      }
    }
  } catch (e: any) {
    errors.push("Paper kill: " + e.message);
  }

  if (closed.length > 0) {
    sendAlert("\uD83D\uDC80", "[PAPER] KILL SWITCH", [
      "Closed: " + closed.join(", "),
    ]).catch(function() {});
  }

  return { closed: closed, errors: errors };
}

// ── Recover positions from Hyperliquid that aren't in the journal ──
// This handles the case where the server restarts and Redis/files are empty
// but positions are still open on the exchange.
async function recoverOrphanedPositions(hl: Hyperliquid, config: BotConfig): Promise<void> {
  var openTrades = await journal.getOpenTrades();
  var knownCoins = new Set(openTrades.map(function(t) { return t.coin; }));

  var walletAddr = getWalletAddress();

  // Fetch ALL live positions including builder dex
  var live = await fetchAllLivePositions(walletAddr);
  var liveCoinsSet = live.coins;

  // 1) Re-open phantom-closed trades that still have live positions
  var allTrades = await journal.getAllTrades();
  var phantomClosed = allTrades.filter(function(t) {
    return t.status !== "open" && t.exitReason === "phantom" && liveCoinsSet.has(t.coin);
  });
  for (var phantom of phantomClosed) {
    var reopened = await journal.reopenTrade(phantom.id);
    if (reopened) {
      knownCoins.add(phantom.coin);
      journal.logAction("RECOVER", "Re-opened phantom-closed " + phantom.coin + " — position still exists on exchange");
    }
  }

  // 2) Recover truly orphaned positions (on exchange but not in journal at all)
  for (var pos of live.positions) {
    var coin = pos.coin;
    if (knownCoins.has(coin)) continue; // already tracked

    // This position exists on HL but not in our journal — recover it
    var szi = parseFloat(pos.szi);
    var direction: "long" | "short" = szi > 0 ? "long" : "short";
    var entryPx = parseFloat(pos.entryPx);
    var leverage = pos.leverage || config.leverage;

    var recoveredTrade: BotTrade = {
      id: genId(),
      coin: coin,
      direction: direction,
      sizeUSD: Math.abs(szi * entryPx / leverage),
      leverage: leverage,
      entryPrice: entryPx,
      entryTime: Date.now() - 3600000, // approximate — we don't know actual entry time
      entryFundingAPR: 0,
      exitPrice: null,
      exitTime: null,
      exitFundingAPR: null,
      exitReason: null,
      pnl: 0,
      fundingEarned: 0,
      totalReturn: 0,
      status: "open",
      spotHedge: false,
      spotEntryPrice: null,
      spotExitPrice: null,
    };

    await journal.addTrade(recoveredTrade);
    journal.logAction("RECOVER", "Recovered orphaned " + direction.toUpperCase() + " " + coin + " position (entry $" + entryPx.toFixed(2) + ")");
  }
}

// ── Clean up journal trades that have no matching exchange position (phantom trades) ──
async function cleanupPhantomTrades(hl: Hyperliquid): Promise<void> {
  var openTrades = await journal.getOpenTrades(false); // non-paper only
  if (openTrades.length === 0) return;

  var walletAddr = getWalletAddress();

  // Fetch ALL live positions including builder dex positions
  var live = await fetchAllLivePositions(walletAddr);
  var liveCoins = live.coins;

  for (var trade of openTrades) {
    if (liveCoins.has(trade.coin)) continue; // position exists on exchange — OK

    // Journal trade has no matching exchange position — it's a phantom
    journal.logAction("CLEANUP", "Phantom trade " + trade.coin + " " + trade.direction.toUpperCase() +
      " — no matching position on exchange, closing journal entry");
    await journal.closeTrade(trade.id, trade.entryPrice, 0, "phantom", 0, 0);
    sendAlert("\uD83D\uDDD1\uFE0F", "PHANTOM CLEANED " + trade.coin, [
      "Direction: " + trade.direction.toUpperCase(),
      "Entry: $" + fmtPx(trade.entryPrice),
      "No matching position found on exchange",
    ]).catch(function() {});
  }
}

// ── Auto-blacklist: analyze trade history and blacklist chronic losers ──
var lastBlacklistCheck = 0;
var BLACKLIST_CHECK_INTERVAL = 6 * 3600 * 1000; // every 6 hours

async function autoUpdateBlacklist(config: BotConfig): Promise<void> {
  var now = Date.now();
  if (now - lastBlacklistCheck < BLACKLIST_CHECK_INTERVAL) return;
  lastBlacklistCheck = now;

  var allTrades = await journal.getAllTrades();
  var closed = allTrades.filter(function(t) { return t.status !== "open"; });
  if (closed.length < 10) return; // not enough data

  // Build per-coin stats
  var coinStats: Record<string, { count: number; wins: number; pnl: number; slCount: number }> = {};
  for (var t of closed) {
    var base = t.coin.replace(/-PERP$/, "").replace(/.*:/, "");
    if (!coinStats[base]) coinStats[base] = { count: 0, wins: 0, pnl: 0, slCount: 0 };
    coinStats[base].count++;
    if (t.totalReturn > 0) coinStats[base].wins++;
    coinStats[base].pnl += t.totalReturn;
    if (t.exitReason === "stop_loss" && t.totalReturn < 0) coinStats[base].slCount++;
  }

  // Find chronic losers: 3+ trades, <30% win rate, net loss > $5
  var autoBlacklist: string[] = [];
  for (var coin in coinStats) {
    var cs = coinStats[coin];
    var winRate = cs.count > 0 ? cs.wins / cs.count : 0;
    if (cs.count >= 3 && winRate < 0.3 && cs.pnl < -5) {
      autoBlacklist.push(coin);
    }
  }

  if (autoBlacklist.length === 0) return;

  // Merge with existing blacklist (don't remove user entries)
  var existing = (config.coinBlacklist || []).map(function(s) { return s.toUpperCase(); });
  var newEntries: string[] = [];
  for (var ab of autoBlacklist) {
    if (existing.indexOf(ab.toUpperCase()) === -1) {
      newEntries.push(ab.toUpperCase());
    }
  }

  if (newEntries.length === 0) return;

  var merged = existing.concat(newEntries);
  await journal.updateConfig({ coinBlacklist: merged });
  journal.logAction("BLACKLIST", "Auto-added " + newEntries.join(", ") + " (chronic losers: 3+ trades, <30% win rate, net negative)");
}

// ── Main bot tick ──
export async function botTick(): Promise<{
  scanned: number;
  opened: string[];
  closed: string[];
  skipped: string[];
  errors: string[];
}> {
  var config = await journal.getConfig();
  var result = { scanned: 0, opened: [] as string[], closed: [] as string[], skipped: [] as string[], errors: [] as string[] };

  if (!config.enabled) {
    journal.logAction("SKIP", "Bot is disabled");
    return result;
  }

  if (!getPrivateKey()) {
    journal.logAction("ERROR", "No private key configured");
    result.errors.push("No private key (env var or secret file)");
    return result;
  }

  var hl: Hyperliquid;
  try {
    hl = await getReadSDK(config);
  } catch (e: any) {
    journal.logAction("ERROR", "SDK init: " + e.message);
    result.errors.push("SDK init: " + e.message);
    return result;
  }

  // ── Step 0: Recover orphaned positions + clean phantoms (skip in paper mode) ──
  if (!config.paperTrading) {
    try {
      await recoverOrphanedPositions(hl, config);
    } catch (e: any) {
      journal.logAction("ERROR", "Position recovery: " + e.message);
    }
    try {
      await cleanupPhantomTrades(hl);
    } catch (e: any) {
      journal.logAction("ERROR", "Phantom cleanup: " + e.message);
    }
  }

  // ── Step 0.5 (paper mode): Accrue funding on open paper trades ──
  if (config.paperTrading) {
    try {
      await accruePaperFunding(hl);
    } catch (e: any) {
      journal.logAction("ERROR", "Paper funding accrual: " + e.message);
    }
  }

  // ── Step 1: Check existing positions & close if needed ──
  try {
    await checkExistingPositions(hl, config, result);
  } catch (e: any) {
    journal.logAction("ERROR", "Position check: " + e.message);
    result.errors.push("Position check: " + e.message);
  }

  // ── Step 1.5: Auto-update coin blacklist from trade history ──
  try {
    await autoUpdateBlacklist(config);
  } catch (e: any) {
    journal.logAction("WARN", "Auto-blacklist: " + e.message);
  }

  // ── Step 2: Scan for new opportunities ──
  // Re-read config in case blacklist was updated
  config = await journal.getConfig();
  try {
    await scanForOpportunities(hl, config, result);
  } catch (e: any) {
    journal.logAction("ERROR", "Scan: " + e.message);
    result.errors.push("Scan: " + e.message);
  }

  return result;
}

// ── Accrue funding on paper trades using real mainnet rates ──
async function accruePaperFunding(hl: Hyperliquid): Promise<void> {
  var openTrades = await journal.getOpenTrades(true); // paper only
  if (openTrades.length === 0) return;

  var metaCtx = await hl.info.perpetuals.getMetaAndAssetCtxs();
  var meta = metaCtx[0];
  var assetCtxs = metaCtx[1];

  // Build hourly funding rate map
  var fundingMap: Record<string, number> = {};
  meta.universe.forEach(function(u: any, i: number) {
    var ctx = assetCtxs[i];
    if (ctx && ctx.funding) {
      fundingMap[u.name] = parseFloat(ctx.funding); // hourly rate
    }
  });

  // Also fetch builder-dex hourly rates for paper trades
  var accrueBuilderCoins = openTrades.filter(function(t) { return t.coin.indexOf(":") !== -1; }).map(function(t) { return t.coin; });
  if (accrueBuilderCoins.length > 0) {
    try {
      var bdAccrue = await fetchBuilderDexFunding(accrueBuilderCoins);
      // Convert APR back to hourly rate for accrual
      for (var abk in bdAccrue.fundingMap) fundingMap[abk] = bdAccrue.fundingMap[abk] / 8760;
    } catch (e: any) { /* non-critical */ }
  }

  var now = Date.now();

  for (var trade of openTrades) {
    var hourlyRate = fundingMap[trade.coin] || 0;
    if (hourlyRate === 0) continue;

    var lastCheck = trade.lastFundingCheck || trade.entryTime;
    var deltaHours = (now - lastCheck) / 3600000;
    if (deltaHours < 0.1) continue; // skip if checked very recently

    // Funding earned: positive hourlyRate = longs pay shorts
    // If we're SHORT and rate > 0, we earn. If LONG and rate < 0, we earn.
    var notional = trade.sizeUSD * trade.leverage;
    var rawFunding = hourlyRate * notional * deltaHours;
    var fundingDelta = trade.direction === "short" ? rawFunding : -rawFunding;

    await journal.updateTradeFunding(trade.id, fundingDelta, now);

    if (Math.abs(fundingDelta) > 0.001) {
      journal.logAction("FUND", "[PAPER] " + trade.coin + " funding: $" + fundingDelta.toFixed(4) +
        " (" + deltaHours.toFixed(1) + "h, rate=" + (hourlyRate * 100).toFixed(4) + "%/h)");
    }
  }
}

// ── Check paper positions for exit conditions (uses journal + mainnet prices) ──
async function checkPaperPositions(
  hl: Hyperliquid,
  config: BotConfig,
  result: { closed: string[]; errors: string[] }
): Promise<void> {
  var openTrades = await journal.getOpenTrades(true); // paper only
  if (openTrades.length === 0) return;

  var mids = await hl.info.getAllMids();
  var metaCtx = await hl.info.perpetuals.getMetaAndAssetCtxs();
  var meta = metaCtx[0];
  var assetCtxs = metaCtx[1];

  var fundingMap: Record<string, number> = {};
  meta.universe.forEach(function(u: any, i: number) {
    var ctx = assetCtxs[i];
    if (ctx && ctx.funding) {
      fundingMap[u.name] = parseFloat(ctx.funding) * 8760; // APR
    }
  });

  // Fetch builder-dex funding/mids for paper trades on non-main dexes
  var paperBuilderCoins = openTrades.filter(function(t) { return t.coin.indexOf(":") !== -1; }).map(function(t) { return t.coin; });
  if (paperBuilderCoins.length > 0) {
    try {
      var bdPaper = await fetchBuilderDexFunding(paperBuilderCoins);
      for (var pbk in bdPaper.fundingMap) fundingMap[pbk] = bdPaper.fundingMap[pbk];
      for (var pmk in bdPaper.mids) mids[pmk] = bdPaper.mids[pmk];
    } catch (e: any) { /* non-critical */ }
  }

  for (var trade of openTrades) {
    try {
      var midPrice = mids[trade.coin] ? parseFloat(mids[trade.coin]) : trade.entryPrice;
      var currentAPR = Math.abs(fundingMap[trade.coin] || 0);
      var holdHours = (Date.now() - trade.entryTime) / 3600000;

      // Calculate unrealized PnL from price movement
      var notional = trade.sizeUSD * trade.leverage;
      var priceChange = (midPrice - trade.entryPrice) / trade.entryPrice;
      var unrealizedPnl = trade.direction === "long"
        ? notional * priceChange
        : notional * (-priceChange);

      // Update live PnL in journal
      await journal.updateTradePnl(trade.id, unrealizedPnl);

      // Trailing stop: once profit exceeds activation threshold, ratchet stop to trail peak price
      if (config.trailingStopPct > 0 && trade.stopPrice != null && unrealizedPnl > 0) {
        var profitPctForTrail = (unrealizedPnl / trade.sizeUSD) * 100;
        if (profitPctForTrail >= config.trailingStopPct) {
          // Calculate trailing stop distance (same as original stop distance from entry)
          var origStopDist = Math.abs(trade.entryPrice - trade.stopPrice);
          var newStop: number;
          if (trade.direction === "long") {
            // Trail below the current high water mark
            newStop = roundSigFigs(midPrice - origStopDist, 5);
            if (newStop > trade.stopPrice) {
              journal.logAction("TRAIL", "[PAPER] " + trade.coin + " trailing stop raised " + trade.stopPrice + " -> " + newStop + " (mid=" + midPrice + ", pnl=" + profitPctForTrail.toFixed(1) + "%)");
              trade.stopPrice = newStop;
              await journal.updateTradeStop(trade.id, newStop);
            }
          } else {
            // Short: trail above the current low water mark
            newStop = roundSigFigs(midPrice + origStopDist, 5);
            if (newStop < trade.stopPrice) {
              journal.logAction("TRAIL", "[PAPER] " + trade.coin + " trailing stop lowered " + trade.stopPrice + " -> " + newStop + " (mid=" + midPrice + ", pnl=" + profitPctForTrail.toFixed(1) + "%)");
              trade.stopPrice = newStop;
              await journal.updateTradeStop(trade.id, newStop);
            }
          }
        }
      }

      // Check exit conditions
      var exitReason: string | null = null;
      var rawAPR = fundingMap[trade.coin] || 0;
      var fundingFavorsUs = (trade.direction === "short" && rawAPR > 0) ||
                            (trade.direction === "long" && rawAPR < 0);

      // Simulated stop-loss: check mid price vs stop level
      if (trade.stopPrice != null) {
        var stopHit = trade.direction === "short"
          ? midPrice >= trade.stopPrice
          : midPrice <= trade.stopPrice;
        if (stopHit) exitReason = "stop_loss";
      }

      // Fallback: PnL-based stop-loss
      var lossPct = Math.abs(unrealizedPnl) / trade.sizeUSD * 100;
      if (!exitReason && unrealizedPnl < 0 && lossPct > config.stopLossPct) {
        exitReason = "stop_loss";
      }

      // Take-profit check
      if (!exitReason && config.takeProfitPct > 0 && unrealizedPnl > 0) {
        var profitPct = (unrealizedPnl / trade.sizeUSD) * 100;
        if (profitPct >= config.takeProfitPct) {
          exitReason = "take_profit";
        }
      }

      // Minimum hold gate: non-SL/TP exits require holding through N funding settlements
      var settlements = countSettlementsSince(trade.entryTime);
      var holdGateMet = settlements >= config.minHoldSettlements;

      if (!exitReason && holdHours > config.maxHoldHours) exitReason = "max_hold";
      // funding_flipped: direction reversed — only if hold gate met
      if (!exitReason && !fundingFavorsUs && holdGateMet) exitReason = "funding_flipped";
      // funding_reverted: magnitude dropped AND direction no longer favors us (tightened)
      if (!exitReason && currentAPR < config.exitAPR && !fundingFavorsUs && holdGateMet) exitReason = "funding_reverted";
      // Also exit if funding magnitude dropped AND we've held long enough (even if direction still ok)
      if (!exitReason && currentAPR < config.exitAPR && holdGateMet) exitReason = "funding_reverted";

      // Funding lock: skip non-critical exits if close to funding settlement
      if (exitReason && exitReason !== "stop_loss" && exitReason !== "take_profit" && config.fundingLockMinutes > 0) {
        var minsLeft = minutesUntilFundingSettlement();
        if (minsLeft <= config.fundingLockMinutes) {
          journal.logAction("LOCK", "[PAPER] " + trade.coin + " exit '" + exitReason + "' deferred — " + minsLeft + "min until funding settlement");
          exitReason = null;
        }
      }

      // Log if hold gate is blocking exit
      if (!exitReason && !holdGateMet && (!fundingFavorsUs || currentAPR < config.exitAPR)) {
        journal.logAction("HOLD", "[PAPER] " + trade.coin + " holding through settlement " + settlements + "/" + config.minHoldSettlements);
      }

      if (exitReason) {
        // Calculate spot hedge PnL for paper mode
        var spotPnl = 0;
        var spotExPx: number | undefined;
        if (trade.spotHedge && trade.spotEntryPrice && trade.spotSizeUSD) {
          // Spot hedge: if we're SHORT perp + LONG spot, spot PnL = spotSize * (exitPrice - entryPrice) / entryPrice
          var spotPriceChange = (midPrice - trade.spotEntryPrice) / trade.spotEntryPrice;
          spotPnl = trade.direction === "short"
            ? trade.spotSizeUSD * spotPriceChange   // long spot gains if price goes up
            : trade.spotSizeUSD * (-spotPriceChange); // short spot gains if price goes down
          spotExPx = midPrice;
        }

        var combinedPnl = unrealizedPnl + spotPnl;
        await journal.closeTrade(trade.id, midPrice, fundingMap[trade.coin] || 0, exitReason, combinedPnl, trade.fundingEarned, spotExPx);
        result.closed.push(trade.coin + ":" + exitReason + " (paper)");
        journal.logAction("CLOSE", "[PAPER] " + trade.coin + " " + exitReason +
          " PnL: $" + combinedPnl.toFixed(2) + " (perp: $" + unrealizedPnl.toFixed(2) +
          (spotPnl !== 0 ? ", spot: $" + spotPnl.toFixed(2) : "") +
          ") Funding: $" + trade.fundingEarned.toFixed(4) +
          " (settlements: " + settlements + ")");

        var totalPnl = combinedPnl + trade.fundingEarned;
        sendAlert(exitReason === "stop_loss" ? "\uD83D\uDEA8" : exitReason === "take_profit" ? "\uD83C\uDFAF" : "\uD83D\uDD34",
          "[PAPER] CLOSE " + trade.coin + " " + trade.direction.toUpperCase(),
          [
            "Reason: " + exitReason,
            "Trade P&L: $" + totalPnl.toFixed(2) + " (perp: $" + unrealizedPnl.toFixed(2) +
              (spotPnl !== 0 ? ", spot: $" + spotPnl.toFixed(2) : "") +
              ", funding: $" + trade.fundingEarned.toFixed(4) + ")",
            "Exit Price: $" + fmtPx(midPrice),
            "Settlements captured: " + settlements,
          ]).catch(function() {});
      }
    } catch (e: any) {
      result.errors.push("Paper check " + trade.coin + ": " + e.message);
    }
  }
}

// ── Check existing positions for exit conditions ──
async function checkExistingPositions(
  hl: Hyperliquid,
  config: BotConfig,
  result: { closed: string[]; errors: string[] }
): Promise<void> {
  // Paper mode: use journal + mainnet prices instead of getClearinghouseState
  if (config.paperTrading) {
    return checkPaperPositions(hl, config, result);
  }

  var openTrades = await journal.getOpenTrades();
  if (openTrades.length === 0) return;

  // Get account state — ALL positions including builder dex
  var walletAddress = getWalletAddress();

  var live = await fetchAllLivePositions(walletAddress);
  // Build a lookup map: coin → position data
  var positionMap: Record<string, typeof live.positions[0]> = {};
  for (var lp of live.positions) {
    positionMap[lp.coin] = lp;
  }

  // Get current funding rates
  var metaCtx = await hl.info.perpetuals.getMetaAndAssetCtxs();
  var meta = metaCtx[0];
  var assetCtxs = metaCtx[1];

  // Build funding rate map
  var fundingMap: Record<string, number> = {};
  meta.universe.forEach(function(u, i) {
    var ctx = assetCtxs[i];
    if (ctx && ctx.funding) {
      fundingMap[u.name] = parseFloat(ctx.funding) * 8760; // APR
    }
  });

  // Fetch builder-dex funding for any open trades on non-main dexes
  var builderDexCoins = openTrades.filter(function(t) { return t.coin.indexOf(":") !== -1; }).map(function(t) { return t.coin; });
  var builderMids: Record<string, string> = {};
  if (builderDexCoins.length > 0) {
    try {
      var bdData = await fetchBuilderDexFunding(builderDexCoins);
      for (var bk in bdData.fundingMap) fundingMap[bk] = bdData.fundingMap[bk];
      builderMids = bdData.mids;
    } catch (e: any) { /* non-critical */ }
  }

  for (var trade of openTrades) {
    try {
      var currentAPR = Math.abs(fundingMap[trade.coin] || 0);
      var holdHours = (Date.now() - trade.entryTime) / 3600000;

      // Find current position from ALL positions (main + builder dex)
      var pos = positionMap[trade.coin];
      var unrealizedPnl = pos ? parseFloat(pos.unrealizedPnl) : 0;
      var currentPrice = pos ? parseFloat(pos.entryPx) : trade.entryPrice; // fallback
      // Negate: HL's cumFunding.sinceOpen is "funding paid" (positive = you paid, negative = you received)
      var cumFunding = pos ? -parseFloat(pos.cumFunding) : 0;

      // Get mid price for PnL calc (check builder dex mids too)
      var mids = await hl.info.getAllMids();
      for (var bmk in builderMids) mids[bmk] = builderMids[bmk];
      var midPrice = mids[trade.coin] ? parseFloat(mids[trade.coin]) : trade.entryPrice;

      // Trailing stop for real mode: ratchet stop using trade.stopPrice as peak tracker
      if (config.trailingStopPct > 0 && trade.stopPrice != null && unrealizedPnl > 0) {
        var profitPctReal = (unrealizedPnl / trade.sizeUSD) * 100;
        if (profitPctReal >= config.trailingStopPct) {
          var origStopDistReal = Math.abs(trade.entryPrice - trade.stopPrice);
          var newStopReal: number;
          if (trade.direction === "long") {
            newStopReal = roundSigFigs(midPrice - origStopDistReal, 5);
            if (newStopReal > trade.stopPrice) {
              journal.logAction("TRAIL", trade.coin + " trailing stop raised " + trade.stopPrice + " -> " + newStopReal + " (mid=" + midPrice + ")");
              trade.stopPrice = newStopReal;
              await journal.updateTradeStop(trade.id, newStopReal);
            }
          } else {
            newStopReal = roundSigFigs(midPrice + origStopDistReal, 5);
            if (newStopReal < trade.stopPrice) {
              journal.logAction("TRAIL", trade.coin + " trailing stop lowered " + trade.stopPrice + " -> " + newStopReal + " (mid=" + midPrice + ")");
              trade.stopPrice = newStopReal;
              await journal.updateTradeStop(trade.id, newStopReal);
            }
          }
        }
      }

      var exitReason: string | null = null;

      // Check if funding direction still favors our position
      var rawAPR = fundingMap[trade.coin] || 0; // signed APR (positive = longs pay, negative = shorts pay)
      var fundingFavorsUs = (trade.direction === "short" && rawAPR > 0) || // we're SHORT & longs pay us
                            (trade.direction === "long" && rawAPR < 0);   // we're LONG & shorts pay us

      // Check exit conditions — include trailing stop price check for real mode
      var lossPct = Math.abs(unrealizedPnl) / trade.sizeUSD * 100;
      var trailingStopHit = false;
      if (trade.stopPrice != null && config.trailingStopPct > 0) {
        trailingStopHit = trade.direction === "long"
          ? midPrice <= trade.stopPrice
          : midPrice >= trade.stopPrice;
      }
      if (trailingStopHit) {
        exitReason = "stop_loss";
      } else if (unrealizedPnl < 0 && lossPct > config.stopLossPct) {
        exitReason = "stop_loss";
      } else if (config.takeProfitPct > 0 && unrealizedPnl > 0) {
        var profitPct = (unrealizedPnl / trade.sizeUSD) * 100;
        if (profitPct >= config.takeProfitPct) {
          exitReason = "take_profit";
        }
      }

      // Minimum hold gate: non-SL/TP exits require holding through N funding settlements
      var settlements = countSettlementsSince(trade.entryTime);
      var holdGateMet = settlements >= config.minHoldSettlements;

      if (!exitReason && holdHours > config.maxHoldHours) {
        exitReason = "max_hold";
      }
      if (!exitReason && !fundingFavorsUs && holdGateMet) {
        exitReason = "funding_flipped";
      }
      if (!exitReason && currentAPR < config.exitAPR && holdGateMet) {
        exitReason = "funding_reverted";
      }

      // Log if hold gate is blocking exit
      if (!exitReason && !holdGateMet && (!fundingFavorsUs || currentAPR < config.exitAPR)) {
        journal.logAction("HOLD", trade.coin + " holding through settlement " + settlements + "/" + config.minHoldSettlements);
      }

      // Funding lock: skip non-critical exits if close to funding settlement
      if (exitReason && exitReason !== "stop_loss" && exitReason !== "take_profit" && config.fundingLockMinutes > 0) {
        var minsLeft = minutesUntilFundingSettlement();
        if (minsLeft <= config.fundingLockMinutes) {
          journal.logAction("LOCK", trade.coin + " exit '" + exitReason + "' deferred — " + minsLeft + "min until funding settlement");
          exitReason = null; // suppress exit, wait for settlement
        }
      }

      if (exitReason) {
        // Close the position via market order
        var closedOk = false;
        var isBuilderDexCoin = trade.coin.indexOf(":") !== -1;
        try {
          if (isBuilderDexCoin) {
            // Builder dex: use raw API to close
            var closeSzi = pos ? parseFloat(pos.szi) : 0;
            var closeSz = Math.abs(closeSzi);
            var closeIsBuy = closeSzi < 0;
            var closeLimitPx = roundPx(closeIsBuy ? midPrice * 1.05 : midPrice * 0.95);
            if (closeSz > 0) {
              await builderDexPlaceOrder({
                coin: trade.coin,
                isBuy: closeIsBuy,
                size: closeSz,
                price: closeLimitPx,
                reduceOnly: true,
                szDecimals: 4,
              });
              closedOk = true;
              journal.logAction("CLOSE", trade.coin + " closed via builder dex API");
            }
          } else {
            await hl.custom.marketClose(trade.coin);
            closedOk = true;
          }
        } catch (e: any) {
          journal.logAction("WARN", "Close " + trade.coin + " failed: " + e.message + " — trying manual close");

          // Fallback: manual close
          try {
            var closeSzi2 = pos ? parseFloat(pos.szi) : 0;
            var closeSz2 = Math.abs(closeSzi2);
            var closeIsBuy2 = closeSzi2 < 0;
            var closeLimitPx2 = roundPx(closeIsBuy2 ? midPrice * 1.05 : midPrice * 0.95);

            if (closeSz2 > 0) {
              if (isBuilderDexCoin) {
                await builderDexPlaceOrder({
                  coin: trade.coin,
                  isBuy: closeIsBuy2,
                  size: closeSz2,
                  price: closeLimitPx2,
                  reduceOnly: true,
                  szDecimals: 4,
                });
              } else {
                await hl.exchange.placeOrder({
                  coin: toPerpCoin(trade.coin),
                  is_buy: closeIsBuy2,
                  sz: closeSz2,
                  limit_px: closeLimitPx2,
                  order_type: { limit: { tif: "Ioc" as any } },
                  reduce_only: true,
                });
              }
              closedOk = true;
              journal.logAction("CLOSE", trade.coin + " closed via manual fallback");
            }
          } catch (e2: any) {
            journal.logAction("ERROR", "Manual close " + trade.coin + ": " + e2.message);
            result.errors.push("Close " + trade.coin + ": " + e2.message);
          }
        }

        if (closedOk) {
          // Unwind spot hedge if active
          var spotExitPx: number | undefined;
          if (trade.spotHedge && trade.spotSizeUSD) {
            try {
              var spotClose = await placeSpotHedge(hl, trade.coin, trade.spotSizeUSD, trade.direction, true);
              if (spotClose.filled) {
                spotExitPx = spotClose.price;
                journal.logAction("SPOT", trade.coin + " spot hedge unwound @ $" + fmtPx(spotClose.price));
              } else {
                journal.logAction("WARN", trade.coin + " spot hedge unwind failed");
              }
            } catch (e: any) {
              journal.logAction("WARN", "Spot unwind " + trade.coin + ": " + e.message);
            }
          }

          await journal.closeTrade(trade.id, midPrice, currentAPR, exitReason, unrealizedPnl, cumFunding, spotExitPx);
          result.closed.push(trade.coin + ":" + exitReason);

          var totalPnl = unrealizedPnl + cumFunding;
          var balInfo = await getAccountStatus();
          sendAlert(exitReason === "stop_loss" ? "\uD83D\uDEA8" : exitReason === "take_profit" ? "\uD83C\uDFAF" : "\uD83D\uDD34",
            "CLOSE " + trade.coin + " " + trade.direction.toUpperCase(),
            [
              "Reason: " + exitReason,
              "Trade P&L: $" + totalPnl.toFixed(2) + " (price: $" + unrealizedPnl.toFixed(2) + ", funding: $" + cumFunding.toFixed(4) + ")",
              "Exit Price: $" + fmtPx(midPrice),
              trade.spotHedge ? "Spot hedge unwound" + (spotExitPx ? " @ $" + fmtPx(spotExitPx) : " (failed)") : "",
              "Balance: $" + balInfo.balance.toFixed(2),
            ].filter(Boolean)).catch(function() {});
        }
      }
    } catch (e: any) {
      result.errors.push("Check " + trade.coin + ": " + e.message);
    }
  }
}

// ── Scan for new opportunities ──
async function scanForOpportunities(
  hl: Hyperliquid,
  config: BotConfig,
  result: { scanned: number; opened: string[]; skipped: string[]; errors: string[] }
): Promise<void> {
  var isPaper = config.paperTrading;
  var openCount = (await journal.getOpenTrades(isPaper ? true : undefined)).length;
  if (openCount >= config.maxPositions) {
    journal.logAction("SCAN", "Max positions reached (" + openCount + "/" + config.maxPositions + ")");
    return;
  }

  // Fetch all funding rates
  var metaCtx = await hl.info.perpetuals.getMetaAndAssetCtxs();
  var meta = metaCtx[0];
  var assetCtxs = metaCtx[1];

  var opportunities: Array<{
    coin: string;
    fundingRate: number;
    fundingAPR: number;
    direction: "long" | "short";
    midPrice: number;
    maxLev: number;
    szDecimals: number;
    volume: number;
    openInterest: number;
  }> = [];

  meta.universe.forEach(function(u, i) {
    var ctx = assetCtxs[i];
    if (!ctx || !ctx.funding) return;

    var rate = parseFloat(ctx.funding);
    var apr = rate * 8760;
    var absAPR = Math.abs(apr);
    var mid = parseFloat(ctx.midPx || ctx.markPx || "0");

    if (absAPR >= config.entryAPR && mid > 0) {
      opportunities.push({
        coin: u.name,
        fundingRate: rate,
        fundingAPR: apr,
        direction: rate > 0 ? "short" : "long", // Positive funding = short to earn
        midPrice: mid,
        maxLev: u.maxLeverage,
        szDecimals: u.szDecimals,
        volume: parseFloat(ctx.dayNtlVlm || "0"),
        openInterest: parseFloat(ctx.openInterest || "0"),
      });
    }
  });

  result.scanned = meta.universe.length;

  // Also scan builder dexes (xyz:HYUNDAI, vntl:OPENAI, etc.)
  try {
    var builderAssets = await fetchBuilderDexOpportunities();
    for (var ba of builderAssets) {
      result.scanned++;
      if (Math.abs(ba.fundingAPR) >= config.entryAPR) {
        opportunities.push({
          coin: ba.coin,
          fundingRate: ba.fundingRate,
          fundingAPR: ba.fundingAPR,
          direction: ba.fundingRate > 0 ? "short" : "long",
          midPrice: ba.midPrice,
          maxLev: ba.maxLev,
          szDecimals: ba.szDecimals,
          volume: ba.volume,
          openInterest: ba.openInterest,
        });
      }
    }
  } catch (e: any) {
    journal.logAction("WARN", "Builder dex scan failed: " + e.message);
  }

  // Sort by highest absolute funding rate
  opportunities.sort(function(a, b) { return Math.abs(b.fundingAPR) - Math.abs(a.fundingAPR); });

  journal.logAction("SCAN", "Found " + opportunities.length + " opportunities above " + (config.entryAPR * 100).toFixed(0) + "% APR (scanned " + result.scanned + " perps)");

  // ── Entry window check: only enter within N minutes of funding settlement at :00 UTC ──
  if (config.entryWindowMinutes > 0) {
    var minsToSettlement = minutesUntilFundingSettlement();
    if (minsToSettlement > config.entryWindowMinutes) {
      journal.logAction("WINDOW", "Outside entry window — " + minsToSettlement + "min to settlement (window: " + config.entryWindowMinutes + "min)");
      return; // Skip all entries this tick
    }
    journal.logAction("WINDOW", "Inside entry window — " + minsToSettlement + "min to settlement");
  }

  for (var opp of opportunities) {
    if (openCount >= config.maxPositions) break;

    // Skip if already have position (filter by current mode)
    if (await journal.isAlreadyOpen(opp.coin, isPaper ? true : undefined)) {
      result.skipped.push(opp.coin + ":already_open");
      continue;
    }

    // Coin blacklist: skip coins the user has explicitly blocked
    if (config.coinBlacklist && config.coinBlacklist.length > 0) {
      var coinBase = opp.coin.replace(/-PERP$/, "").replace(/.*:/, ""); // "SOPH-PERP" → "SOPH", "xyz:xyz:MU" → "MU"
      var isBlacklisted = config.coinBlacklist.some(function(b) {
        return b.toUpperCase() === coinBase.toUpperCase() || b.toUpperCase() === opp.coin.toUpperCase();
      });
      if (isBlacklisted) {
        result.skipped.push(opp.coin + ":blacklisted");
        journal.logAction("FILTER", opp.coin + " skipped — coin is blacklisted");
        continue;
      }
    }

    // Skip if coin is in stop-loss cooldown
    if (await isInSLCooldown(opp.coin, config.slCooldownHours)) {
      result.skipped.push(opp.coin + ":sl_cooldown");
      journal.logAction("COOLDOWN", opp.coin + " skipped — in SL cooldown (" + config.slCooldownHours + "h)");
      continue;
    }

    // General re-entry cooldown: wait N hours after ANY exit on same coin
    if (await isInReEntryCooldown(opp.coin, config.reEntryCooldownHours)) {
      result.skipped.push(opp.coin + ":reentry_cooldown");
      journal.logAction("COOLDOWN", opp.coin + " skipped — in re-entry cooldown (" + config.reEntryCooldownHours + "h)");
      continue;
    }

    // Funding persistence check: require N consecutive hours above entry threshold
    if (config.minFundingPersistHours > 0) {
      var persistent = await isFundingPersistent(opp.coin, config.entryAPR, config.minFundingPersistHours);
      if (!persistent) {
        result.skipped.push(opp.coin + ":funding_not_persistent");
        journal.logAction("FILTER", opp.coin + " skipped — funding not persistent for " + config.minFundingPersistHours + "h");
        continue;
      }
    }

    // Per-coin loss memory: skip if stopped out 2+ times in last 48h
    var slCount = await recentSLCount(opp.coin, 48);
    if (slCount >= 2) {
      result.skipped.push(opp.coin + ":repeat_loser(" + slCount + "SLs/48h)");
      journal.logAction("FILTER", opp.coin + " skipped — " + slCount + " stop-losses in last 48h (blacklisted)");
      continue;
    }

    // Stale price detection: skip if market appears frozen
    var stale = await isPriceStale(opp.coin, opp.midPrice);
    if (stale) {
      result.skipped.push(opp.coin + ":stale_price");
      journal.logAction("FILTER", opp.coin + " skipped — price appears stale/frozen (identical across recent trades)");
      continue;
    }

    // ── Safety filters ──
    // Builder dex coins (xyz:xyz:CL, flx:flx:OIL, etc.) have fundamentally different
    // liquidity profiles — lower volume/OI but stable funding. Skip volume/OI filters for them.
    var isBuilderDex = opp.coin.indexOf(":") !== -1;

    // Min 24h volume filter (skip for builder dex)
    if (!isBuilderDex && config.minVolume > 0 && opp.volume < config.minVolume) {
      result.skipped.push(opp.coin + ":low_volume($" + Math.round(opp.volume) + ")");
      journal.logAction("FILTER", opp.coin + " skipped — 24h volume $" + Math.round(opp.volume) + " < min $" + config.minVolume);
      continue;
    }

    // Min open interest filter (skip for builder dex)
    if (!isBuilderDex && config.minOI > 0 && opp.openInterest < config.minOI) {
      result.skipped.push(opp.coin + ":low_oi($" + Math.round(opp.openInterest) + ")");
      journal.logAction("FILTER", opp.coin + " skipped — OI $" + Math.round(opp.openInterest) + " < min $" + config.minOI);
      continue;
    }

    // Price momentum filter: skip if price moved against our direction > maxDropPct in last 4h
    // Long entries: skip if price dropped too much (momentum against us)
    // Short entries: skip if price pumped too much (momentum against us)
    if (config.maxDropPct > 0) {
      try {
        var movePct: number;
        var moveLabel: string;
        if (opp.direction === "long") {
          movePct = await getRecentPriceDrop(opp.coin, opp.midPrice);
          moveLabel = "dropped";
        } else {
          movePct = await getRecentPriceRise(opp.coin, opp.midPrice);
          moveLabel = "pumped";
        }
        if (movePct > config.maxDropPct) {
          result.skipped.push(opp.coin + ":price_momentum(" + movePct.toFixed(1) + "%)");
          journal.logAction("FILTER", opp.coin + " skipped — price " + moveLabel + " " + movePct.toFixed(1) + "% in 4h (max " + config.maxDropPct + "%)");
          continue;
        }
      } catch (e: any) {
        // Non-critical: if candle fetch fails, allow entry
      }
    }

    // Max volatility filter: skip coins where recent hourly ATR is too high (gap risk)
    if (config.maxVolatilityPct > 0) {
      try {
        var recentVol = await getRecentVolatility(opp.coin);
        if (recentVol > config.maxVolatilityPct) {
          result.skipped.push(opp.coin + ":high_volatility(" + recentVol.toFixed(1) + "%)");
          journal.logAction("FILTER", opp.coin + " skipped — volatility " + recentVol.toFixed(1) + "% > max " + config.maxVolatilityPct + "% (gap risk)");
          continue;
        }
      } catch (e: any) {
        // Non-critical: if volatility fetch fails, allow entry
      }
    }

    // Per-coin daily loss limit: stop trading a coin after losing $X in rolling 24h
    if (config.perCoinMaxLoss > 0) {
      var coinLoss24h = await getCoinLoss24h(opp.coin);
      if (coinLoss24h >= config.perCoinMaxLoss) {
        result.skipped.push(opp.coin + ":daily_loss_limit($" + coinLoss24h.toFixed(0) + ")");
        journal.logAction("FILTER", opp.coin + " skipped — lost $" + coinLoss24h.toFixed(2) + " in 24h (max $" + config.perCoinMaxLoss + ")");
        continue;
      }
    }

    // Calculate position size (with dynamic OI-based cap)
    var lev = Math.min(config.leverage, opp.maxLev);
    var positionUSD = config.maxPositionUSD;

    // Cap position size as % of token OI (skip for builder dex — different liquidity)
    if (!isBuilderDex && config.maxOIPct > 0 && opp.openInterest > 0) {
      var maxFromOI = (opp.openInterest * config.maxOIPct) / 100;
      if (maxFromOI < positionUSD) {
        journal.logAction("SIZE", opp.coin + " position capped $" + positionUSD + " → $" + maxFromOI.toFixed(0) + " (" + config.maxOIPct + "% of OI $" + Math.round(opp.openInterest) + ")");
        positionUSD = maxFromOI;
      }
    }

    var notional = positionUSD * lev;
    var rawSize = notional / opp.midPrice;
    var size = parseFloat(rawSize.toFixed(opp.szDecimals));

    if (size <= 0) {
      result.skipped.push(opp.coin + ":size_zero");
      continue;
    }

    // Guard: skip if capped position is too small to be meaningful (< $5)
    if (positionUSD < 5) {
      result.skipped.push(opp.coin + ":position_too_small($" + positionUSD.toFixed(2) + ")");
      journal.logAction("FILTER", opp.coin + " skipped — position $" + positionUSD.toFixed(2) + " too small after OI cap (possible testnet/bad data)");
      continue;
    }

    if (isPaper) {
      // ── Paper mode: simulate fill at mid price ──
      try {
        var fillPrice = opp.midPrice;
        // Volatility-adjusted stop: use at least 1.5x recent hourly ATR or the configured SL%, whichever is wider
        var basePriceMoveThreshold = config.stopLossPct / (lev * 100);
        var volatility = await getRecentVolatility(opp.coin);
        // Minimum stop distance = 1.5 * average hourly range (as decimal)
        var volBasedThreshold = volatility > 0 ? (volatility * 1.5) / 100 : 0;
        var priceMoveThreshold = Math.max(basePriceMoveThreshold, volBasedThreshold);
        var simStopPrice = opp.direction === "short"
          ? roundSigFigs(fillPrice * (1 + priceMoveThreshold), 5)
          : roundSigFigs(fillPrice * (1 - priceMoveThreshold), 5);

        // Spot hedge for paper mode: simulate at current price
        var spotHedgeActive = config.spotHedge && opp.coin.indexOf(":") === -1; // no spot for builder-dex
        var spotEntryPx: number | null = null;
        var spotSz = 0;
        if (spotHedgeActive) {
          try {
            var spotMid = await getSpotMidPrice(hl, opp.coin);
            if (spotMid > 0) {
              spotEntryPx = spotMid;
              spotSz = positionUSD * config.spotHedgeRatio;
            } else {
              spotHedgeActive = false;
              journal.logAction("WARN", "[PAPER] No spot market for " + opp.coin + " — skipping hedge");
            }
          } catch (e: any) {
            spotHedgeActive = false;
          }
        }

        var paperTrade: BotTrade = {
          id: genId(),
          coin: opp.coin,
          direction: opp.direction,
          sizeUSD: positionUSD,
          leverage: lev,
          entryPrice: fillPrice,
          entryTime: Date.now(),
          entryFundingAPR: opp.fundingAPR,
          exitPrice: null,
          exitTime: null,
          exitFundingAPR: null,
          exitReason: null,
          pnl: 0,
          fundingEarned: 0,
          totalReturn: 0,
          status: "open",
          spotHedge: spotHedgeActive,
          spotEntryPrice: spotEntryPx,
          spotExitPrice: null,
          paper: true,
          lastFundingCheck: Date.now(),
          stopPrice: simStopPrice,
          settlementsCaptured: 0,
          spotSizeUSD: spotHedgeActive ? spotSz : undefined,
        };

        await journal.addTrade(paperTrade);
        journal.logAction("OPEN", "[PAPER] " + opp.coin + " " + opp.direction.toUpperCase() +
          " $" + positionUSD + " @ $" + fmtPx(fillPrice) +
          " (APR: " + (opp.fundingAPR * 100).toFixed(0) + "%, SL: $" + fmtPx(simStopPrice) + ")" +
          (spotHedgeActive ? " [SPOT HEDGE $" + spotSz.toFixed(0) + " @ $" + fmtPx(spotEntryPx!) + "]" : ""));

        sendAlert("\uD83D\uDCDD", "[PAPER] OPEN " + opp.coin + " " + opp.direction.toUpperCase(), [
          "Size: $" + positionUSD + " @ " + lev + "x",
          "Price: $" + fmtPx(fillPrice),
          "APR: " + (opp.fundingAPR * 100).toFixed(0) + "%",
          "Stop-Loss: $" + fmtPx(simStopPrice),
          spotHedgeActive ? "Spot Hedge: $" + spotSz.toFixed(0) + " @ $" + fmtPx(spotEntryPx!) : "",
          "Paper Balance: $" + config.paperBalance.toFixed(2),
        ].filter(Boolean)).catch(function() {});

        result.opened.push(opp.coin + ":" + opp.direction + " @ $" + fillPrice.toFixed(2) + " (paper)");
        openCount++;
      } catch (e: any) {
        journal.logAction("ERROR", "[PAPER] Open " + opp.coin + ": " + e.message);
        result.errors.push("Paper open " + opp.coin + ": " + e.message);
      }

    } else {
      // ── Real mode: place actual orders on exchange ──
      try {
        // Set leverage
        var isBuy = opp.direction === "long";
        var isBuilderDex = opp.coin.indexOf(":") !== -1;

        if (isBuilderDex) {
          // Builder dex: use raw API (SDK doesn't support builder dex asset indices)
          await builderDexUpdateLeverage(opp.coin, lev);
        } else {
          await hl.exchange.updateLeverage(opp.coin, "cross", lev);
        }

        // Place market order
        var orderResult: any;

        if (isBuilderDex) {
          // Builder dex: use raw signed API with correct asset index
          var limitPx = roundPx(isBuy ? opp.midPrice * 1.05 : opp.midPrice * 0.95);
          orderResult = await builderDexPlaceOrder({
            coin: opp.coin,
            isBuy: isBuy,
            size: size,
            price: limitPx,
            reduceOnly: false,
            szDecimals: opp.szDecimals,
          });
        } else {
          orderResult = await hl.custom.marketOpen(opp.coin, isBuy, size);
        }

        // Validate the order actually filled
        var fillPrice = 0;
        var fillSize = 0;
        var orderError = "";

        if (orderResult && orderResult.response && orderResult.response.data && orderResult.response.data.statuses) {
          var statuses = orderResult.response.data.statuses;
          var status0 = statuses[0];
          if (status0 && status0.filled) {
            fillPrice = parseFloat(status0.filled.avgPx);
            fillSize = parseFloat(status0.filled.totalSz);
          } else if (status0 && status0.resting) {
            // Resting limit — use mid price estimate
            fillPrice = opp.midPrice;
            fillSize = size;
          } else if (status0 && status0.error) {
            orderError = status0.error;
          }
        }

        if (orderError || fillPrice === 0) {
          var rejectMsg = orderError || "Order not filled (no fill in response)";
          journal.logAction("REJECT", opp.coin + " " + opp.direction.toUpperCase() + " order rejected: " + rejectMsg);
          sendAlert("\u26A0\uFE0F", "REJECTED " + opp.coin + " " + opp.direction.toUpperCase(), [
            "Reason: " + rejectMsg,
            "Size: $" + positionUSD + " @ " + lev + "x",
          ]).catch(function() {});
          result.errors.push(opp.coin + ": " + rejectMsg);
          continue; // Skip — no position opened, don't record trade
        }

        // Spot hedge on entry (real mode)
        var realSpotHedge = config.spotHedge && opp.coin.indexOf(":") === -1;
        var realSpotPx: number | null = null;
        var realSpotSz = 0;
        if (realSpotHedge) {
          try {
            var hedgeResult = await placeSpotHedge(hl, opp.coin, positionUSD * config.spotHedgeRatio, opp.direction, false);
            if (hedgeResult.filled) {
              realSpotPx = hedgeResult.price;
              realSpotSz = positionUSD * config.spotHedgeRatio;
              journal.logAction("SPOT", opp.coin + " spot hedge filled @ $" + fmtPx(realSpotPx));
            } else {
              realSpotHedge = false;
              journal.logAction("WARN", opp.coin + " spot hedge failed — proceeding without");
            }
          } catch (e: any) {
            realSpotHedge = false;
            journal.logAction("WARN", "Spot hedge " + opp.coin + ": " + e.message);
          }
        }

        journal.logAction("OPEN", opp.coin + " " + opp.direction.toUpperCase() +
          " $" + positionUSD + " @ $" + fmtPx(fillPrice) +
          " (APR: " + (opp.fundingAPR * 100).toFixed(0) + "%, filled " + fillSize + ")" +
          (realSpotHedge ? " [SPOT HEDGE $" + realSpotSz.toFixed(0) + "]" : ""));

        // Record trade
        var trade: BotTrade = {
          id: genId(),
          coin: opp.coin,
          direction: opp.direction,
          sizeUSD: positionUSD,
          leverage: lev,
          entryPrice: fillPrice,
          entryTime: Date.now(),
          entryFundingAPR: opp.fundingAPR,
          exitPrice: null,
          exitTime: null,
          exitFundingAPR: null,
          exitReason: null,
          pnl: 0,
          fundingEarned: 0,
          totalReturn: 0,
          status: "open",
          spotHedge: realSpotHedge,
          spotEntryPrice: realSpotPx,
          spotExitPrice: null,
          paper: false,
          lastFundingCheck: Date.now(),
          stopPrice: null,
          settlementsCaptured: 0,
          spotSizeUSD: realSpotHedge ? realSpotSz : undefined,
        };

        await journal.addTrade(trade);

        // Place stop-loss order on Hyperliquid (or track in software for builder dex)
        try {
          var realBasePMT = config.stopLossPct / (lev * 100);
          var realVol = await getRecentVolatility(opp.coin);
          var realVolThreshold = realVol > 0 ? (realVol * 1.5) / 100 : 0;
          var priceMoveThreshold = Math.max(realBasePMT, realVolThreshold);
          var stopPrice: number;
          var slBuy: boolean;

          if (opp.direction === "short") {
            stopPrice = fillPrice * (1 + priceMoveThreshold);
            slBuy = true;
          } else {
            stopPrice = fillPrice * (1 - priceMoveThreshold);
            slBuy = false;
          }

          stopPrice = roundPx(stopPrice);

          // Store the stop price on the trade record for trailing stop tracking
          trade.stopPrice = stopPrice;
          await journal.updateTradeStop(trade.id, stopPrice);

          if (isBuilderDex) {
            // Builder dex: SDK can't place trigger orders, use software-based SL
            // The bot tick loop checks trade.stopPrice each cycle and closes if hit
            journal.logAction("SL", opp.coin + " software stop-loss set at $" + fmtPx(stopPrice) + " (" + config.stopLossPct + "% loss)");
          } else {
            // Main dex: place exchange-level stop-loss for instant execution
            var slLimitPx = roundPx(slBuy ? stopPrice * 1.10 : stopPrice * 0.90);
            var slSize = fillSize > 0 ? fillSize : size;

            var slResponse = await hl.exchange.placeOrder({
              coin: toPerpCoin(opp.coin),
              is_buy: slBuy,
              sz: slSize,
              limit_px: slLimitPx,
              order_type: { trigger: { triggerPx: stopPrice, isMarket: true, tpsl: "sl" } },
              reduce_only: true,
              grouping: "na",
            });

            var slAccepted = false;
            if (slResponse && slResponse.response && slResponse.response.data && slResponse.response.data.statuses) {
              var slStatus = slResponse.response.data.statuses[0];
              if (slStatus && slStatus.resting) {
                slAccepted = true;
              } else if (slStatus && slStatus.filled) {
                slAccepted = true;
              } else if (slStatus && slStatus.error) {
                throw new Error(slStatus.error);
              }
            }

            if (slAccepted) {
              journal.logAction("SL", opp.coin + " stop-loss set at $" + fmtPx(stopPrice) + " (" + config.stopLossPct + "% loss)");
            } else {
              journal.logAction("WARN", "Stop-loss response unclear for " + opp.coin + ": " + JSON.stringify(slResponse).slice(0, 200));
            }
          }
        } catch (slErr: any) {
          journal.logAction("WARN", "Stop-loss placement failed for " + opp.coin + ": " + slErr.message);
        }

        // Telegram alert for new trade
        var balInfo = await getAccountStatus();
        sendAlert("\uD83D\uDFE2", "OPEN " + opp.coin + " " + opp.direction.toUpperCase(), [
          "Size: $" + positionUSD + " @ " + lev + "x",
          "Price: $" + fmtPx(fillPrice),
          "APR: " + (opp.fundingAPR * 100).toFixed(0) + "%",
          "Balance: $" + balInfo.balance.toFixed(2),
        ]).catch(function() {});

        result.opened.push(opp.coin + ":" + opp.direction + " @ $" + fmtPx(fillPrice));
        openCount++;

      } catch (e: any) {
        journal.logAction("ERROR", "Open " + opp.coin + ": " + e.message);
        result.errors.push("Open " + opp.coin + ": " + e.message);
      }
    }
  }
}

// ── Get account status ──
export async function getAccountStatus(): Promise<{
  balance: number;
  marginUsed: number;
  positions: Array<{ coin: string; size: string; entryPx: string; unrealizedPnl: string; leverage: number }>;
  walletAddress: string;
  error: string;
  debug: Record<string, any>;
}> {
  var config = await journal.getConfig();

  // Paper mode: return simulated account from journal data
  if (config.paperTrading) {
    return getPaperAccountStatus(config);
  }

  var walletAddr = "";
  var debug: Record<string, any> = { testnetConfig: config.testnet };

  try {
    walletAddr = getWalletAddress();
    debug.walletAddress = walletAddr;
  } catch (e) {
    return { balance: 0, marginUsed: 0, positions: [], walletAddress: "", error: "No private key found", debug: debug };
  }

  // Fetch spot balance (unified accounts keep USDC in spot clearinghouse)
  var spotBalance = 0;
  try {
    var apiUrl = config.testnet
      ? "https://api.hyperliquid-testnet.xyz/info"
      : "https://api.hyperliquid.xyz/info";
    debug.apiUrl = apiUrl;

    var spotRes = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "spotClearinghouseState", user: walletAddr }),
    });
    var spotJson = await spotRes.json();
    if (spotJson && Array.isArray(spotJson.balances)) {
      var usdcBal = spotJson.balances.find(function(b: any) { return b.coin === "USDC"; });
      if (usdcBal) spotBalance = parseFloat(usdcBal.total || "0");
    }
    debug.spotBalance = spotBalance;
  } catch (e: any) {
    debug.spotError = e.message;
  }

  try {
    var hl = await getSDK(config);
    debug.sdkBaseUrl = (hl as any).baseUrl || "unknown";

    var state = await hl.info.perpetuals.getClearinghouseState(walletAddr);
    var perpsAccountValue = parseFloat(state.marginSummary.accountValue);
    var perpsMarginUsed = parseFloat(state.marginSummary.totalMarginUsed);
    debug.perpsAccountValue = perpsAccountValue;
    debug.spotBalance = spotBalance;
    // Unified account: spot USDC backs perps cross-margin.
    // Show spot as "balance" since that's the total collateral the user deposited.
    var totalEquity = spotBalance > 0 ? spotBalance : perpsAccountValue;
    debug.totalEquity = totalEquity;

    // Fetch ALL positions including builder dex
    var live = await fetchAllLivePositions(walletAddr);
    debug.totalPositions = live.positions.length;

    return {
      balance: totalEquity,
      marginUsed: perpsMarginUsed,
      positions: live.positions.map(function(p) {
        return {
          coin: p.coin,
          size: p.szi,
          entryPx: p.entryPx,
          unrealizedPnl: p.unrealizedPnl,
          leverage: p.leverage,
        };
      }),
      walletAddress: walletAddr,
      error: "",
      debug: debug,
    };
  } catch (e: any) {
    var errMsg = e.message || "Unknown error";
    journal.logAction("ERROR", "Account status: " + errMsg);
    debug.sdkError = errMsg;
    // If perps SDK fails but we have spot balance, still show it
    return { balance: spotBalance, marginUsed: 0, positions: [], walletAddress: walletAddr, error: errMsg, debug: debug };
  }
}

// ── Paper mode account status (simulated balance from journal) ──
async function getPaperAccountStatus(config: BotConfig): Promise<{
  balance: number;
  marginUsed: number;
  positions: Array<{ coin: string; size: string; entryPx: string; unrealizedPnl: string; leverage: number }>;
  walletAddress: string;
  error: string;
  debug: Record<string, any>;
}> {
  var openTrades = await journal.getOpenTrades(true);
  var allTrades = await journal.getAllTrades();
  var closedPaper = allTrades.filter(function(t) { return t.paper && t.status !== "open"; });
  var realizedPnl = closedPaper.reduce(function(s, t) { return s + t.totalReturn; }, 0);
  var unrealizedPnl = openTrades.reduce(function(s, t) { return s + t.pnl + t.fundingEarned; }, 0);
  var marginUsed = openTrades.reduce(function(s, t) { return s + t.sizeUSD; }, 0);
  var balance = config.paperBalance + realizedPnl + unrealizedPnl;

  return {
    balance: balance,
    marginUsed: marginUsed,
    positions: openTrades.map(function(t) {
      return {
        coin: t.coin,
        size: ((t.sizeUSD * t.leverage) / t.entryPrice).toFixed(6),
        entryPx: t.entryPrice.toFixed(2),
        unrealizedPnl: t.pnl.toFixed(2),
        leverage: t.leverage,
      };
    }),
    walletAddress: "PAPER_TRADING",
    error: "",
    debug: { mode: "paper", startingBalance: config.paperBalance, realizedPnl: realizedPnl },
  };
}

// ── Get live position P&L details (for kill switch) ──
export async function getPositionDetails(): Promise<Record<string, { unrealizedPnl: number; cumFunding: number; midPrice: number }>> {
  var config = await journal.getConfig();

  // Paper mode: calculate from journal trades + mainnet prices
  if (config.paperTrading) {
    return getPaperPositionDetails();
  }

  var result: Record<string, { unrealizedPnl: number; cumFunding: number; midPrice: number }> = {};

  try {
    var walletAddr = getWalletAddress();
    var hl = await getSDK(config);

    // Fetch ALL live positions (main dex + builder dexes)
    var live = await fetchAllLivePositions(walletAddr);
    var mids = await hl.info.getAllMids();

    // Also fetch builder-dex mids for builder dex positions
    var builderCoins = live.positions
      .filter(function(p) { return p.coin.indexOf(":") !== -1; })
      .map(function(p) { return p.coin; });
    if (builderCoins.length > 0) {
      try {
        var bdData = await fetchBuilderDexFunding(builderCoins);
        for (var bk in bdData.mids) mids[bk] = bdData.mids[bk];
      } catch (e: any) { /* non-critical */ }
    }

    for (var pos of live.positions) {
      var coin = pos.coin;
      result[coin] = {
        unrealizedPnl: parseFloat(pos.unrealizedPnl),
        // Negate: HL's cumFunding.sinceOpen is "funding paid" (positive = you paid)
        // We want positive = you earned
        cumFunding: -parseFloat(pos.cumFunding),
        midPrice: mids[coin] ? parseFloat(mids[coin]) : parseFloat(pos.entryPx),
      };
    }
  } catch (e: any) {
    journal.logAction("ERROR", "getPositionDetails: " + e.message);
  }

  return result;
}

// ── Paper mode position details ──
async function getPaperPositionDetails(): Promise<Record<string, { unrealizedPnl: number; cumFunding: number; midPrice: number }>> {
  var result: Record<string, { unrealizedPnl: number; cumFunding: number; midPrice: number }> = {};

  try {
    var hl = await getMainnetSDK();
    var mids = await hl.info.getAllMids();
    var openTrades = await journal.getOpenTrades(true);

    // Fetch builder-dex mids for any paper trades on non-main dexes
    var builderCoins = openTrades.filter(function(t) { return t.coin.indexOf(":") !== -1; }).map(function(t) { return t.coin; });
    if (builderCoins.length > 0) {
      try {
        var bdData = await fetchBuilderDexFunding(builderCoins);
        for (var bk in bdData.mids) mids[bk] = bdData.mids[bk];
      } catch (e: any) { /* non-critical */ }
    }

    for (var trade of openTrades) {
      var midPrice = mids[trade.coin] ? parseFloat(mids[trade.coin]) : trade.entryPrice;
      var notional = trade.sizeUSD * trade.leverage;
      var priceChange = (midPrice - trade.entryPrice) / trade.entryPrice;
      var unrealizedPnl = trade.direction === "long"
        ? notional * priceChange
        : notional * (-priceChange);

      result[trade.coin] = {
        unrealizedPnl: unrealizedPnl,
        cumFunding: trade.fundingEarned,
        midPrice: midPrice,
      };
    }
  } catch (e: any) {
    journal.logAction("ERROR", "getPaperPositionDetails: " + e.message);
  }

  return result;
}

// ── Get current funding rates for all perps (including builder dexes) ──
export async function getFundingRates(): Promise<Record<string, number>> {
  var config = await journal.getConfig();
  var rates: Record<string, number> = {};

  try {
    var hl = await getReadSDK(config);
    var metaCtx = await hl.info.perpetuals.getMetaAndAssetCtxs();
    var meta = metaCtx[0];
    var assetCtxs = metaCtx[1];

    meta.universe.forEach(function(u: any, i: number) {
      var ctx = assetCtxs[i];
      if (ctx && ctx.funding) {
        rates[u.name] = parseFloat(ctx.funding) * 8760; // APR
      }
    });

    // Also fetch builder-dex funding rates
    try {
      var builderAssets = await fetchBuilderDexOpportunities();
      for (var ba of builderAssets) {
        rates[ba.coin] = ba.fundingAPR;
      }
    } catch (e: any) { /* non-critical */ }
  } catch (e: any) {
    journal.logAction("ERROR", "getFundingRates: " + e.message);
  }

  return rates;
}
