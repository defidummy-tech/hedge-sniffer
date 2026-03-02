// ═══ Trading Bot Engine ═══
// Connects to Hyperliquid via SDK, scans funding rates, opens/closes positions.

import { Hyperliquid } from "hyperliquid";
import { ethers } from "ethers";
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

// ── SDK singleton (lazy init) ──
var sdk: Hyperliquid | null = null;
var sdkReady = false;

async function getSDK(config: BotConfig): Promise<Hyperliquid> {
  var key = getPrivateKey();
  if (!key) throw new Error("No private key found (checked HYPERLIQUID_PRIVATE_KEY env var and /etc/secrets/hyperliquid_key.txt)");

  if (!sdk) {
    sdk = new Hyperliquid({
      privateKey: key,
      testnet: config.testnet,
      enableWs: false,
    });
    await sdk.connect();
    sdkReady = true;
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

    // Get all live positions from Hyperliquid
    var state = await hl.info.perpetuals.getClearinghouseState(walletAddr);
    var livePositions = state.assetPositions.filter(function(p) {
      return parseFloat(p.position.szi) !== 0;
    });

    journal.logAction("KILL", "Found " + livePositions.length + " live position(s) to close");

    // Get mid prices for manual close fallback
    var mids = await hl.info.getAllMids();

    for (var pos of livePositions) {
      var coin = pos.position.coin;
      var szi = parseFloat(pos.position.szi);
      var closeSize = Math.abs(szi);
      var isBuy = szi < 0; // if short (negative size), buy to close
      try {
        await hl.custom.marketClose(coin);
        closed.push(coin);
        journal.logAction("KILL", "Closed " + coin);
      } catch (e: any) {
        journal.logAction("WARN", "marketClose " + coin + " failed: " + e.message + " — trying manual close");

        // Fallback: manual close using exchange.placeOrder directly
        // This bypasses the SDK's internal symbol matching which can fail for some coins (e.g. ETH)
        try {
          var midPrice = parseFloat(mids[coin] || "0");
          if (midPrice <= 0) throw new Error("No mid price for " + coin);

          var limitPrice = roundPx(isBuy ? midPrice * 1.05 : midPrice * 0.95);

          await hl.exchange.placeOrder({
            coin: toPerpCoin(coin),
            is_buy: isBuy,
            sz: closeSize,
            limit_px: limitPrice,
            order_type: { limit: { tif: "Ioc" as any } },
            reduce_only: true,
          });

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
  var state = await hl.info.perpetuals.getClearinghouseState(walletAddr);

  var livePositions = state.assetPositions.filter(function(p) {
    return parseFloat(p.position.szi) !== 0;
  });

  for (var pos of livePositions) {
    var coin = pos.position.coin;
    if (knownCoins.has(coin)) continue; // already tracked

    // This position exists on HL but not in our journal — recover it
    var szi = parseFloat(pos.position.szi);
    var direction: "long" | "short" = szi > 0 ? "long" : "short";
    var entryPx = parseFloat(pos.position.entryPx);
    var leverage = pos.position.leverage ? pos.position.leverage.value : config.leverage;

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

  // ── Step 0: Recover orphaned positions (skip in paper mode — no real positions) ──
  if (!config.paperTrading) {
    try {
      await recoverOrphanedPositions(hl, config);
    } catch (e: any) {
      journal.logAction("ERROR", "Position recovery: " + e.message);
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

  // ── Step 2: Scan for new opportunities ──
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

      if (!exitReason && holdHours > config.maxHoldHours) exitReason = "max_hold";
      if (!exitReason && !fundingFavorsUs) exitReason = "funding_flipped";
      if (!exitReason && currentAPR < config.exitAPR) exitReason = "funding_reverted";

      if (exitReason) {
        await journal.closeTrade(trade.id, midPrice, fundingMap[trade.coin] || 0, exitReason, unrealizedPnl, trade.fundingEarned);
        result.closed.push(trade.coin + ":" + exitReason + " (paper)");
        journal.logAction("CLOSE", "[PAPER] " + trade.coin + " " + exitReason +
          " PnL: $" + unrealizedPnl.toFixed(2) + " Funding: $" + trade.fundingEarned.toFixed(4));

        var totalPnl = unrealizedPnl + trade.fundingEarned;
        sendAlert(exitReason === "stop_loss" ? "\uD83D\uDEA8" : "\uD83D\uDD34",
          "[PAPER] CLOSE " + trade.coin + " " + trade.direction.toUpperCase(),
          [
            "Reason: " + exitReason,
            "Trade P&L: $" + totalPnl.toFixed(2) + " (price: $" + unrealizedPnl.toFixed(2) + ", funding: $" + trade.fundingEarned.toFixed(4) + ")",
            "Exit Price: $" + fmtPx(midPrice),
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

  // Get account state
  var walletAddress = getWalletAddress();

  var state = await hl.info.perpetuals.getClearinghouseState(walletAddress);

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

  for (var trade of openTrades) {
    try {
      var currentAPR = Math.abs(fundingMap[trade.coin] || 0);
      var holdHours = (Date.now() - trade.entryTime) / 3600000;

      // Find current position
      var pos = state.assetPositions.find(function(p) { return p.position.coin === trade.coin; });
      var unrealizedPnl = pos ? parseFloat(pos.position.unrealizedPnl) : 0;
      var currentPrice = pos ? parseFloat(pos.position.entryPx) : trade.entryPrice; // fallback
      var cumFunding = pos ? parseFloat(pos.position.cumFunding.sinceOpen) : 0;

      // Get mid price for PnL calc
      var mids = await hl.info.getAllMids();
      var midPrice = mids[trade.coin] ? parseFloat(mids[trade.coin]) : trade.entryPrice;

      var exitReason: string | null = null;

      // Check if funding direction still favors our position
      var rawAPR = fundingMap[trade.coin] || 0; // signed APR (positive = longs pay, negative = shorts pay)
      var fundingFavorsUs = (trade.direction === "short" && rawAPR > 0) || // we're SHORT & longs pay us
                            (trade.direction === "long" && rawAPR < 0);   // we're LONG & shorts pay us

      // Check exit conditions
      var lossPct = Math.abs(unrealizedPnl) / trade.sizeUSD * 100;
      if (unrealizedPnl < 0 && lossPct > config.stopLossPct) {
        exitReason = "stop_loss";
      } else if (holdHours > config.maxHoldHours) {
        exitReason = "max_hold";
      } else if (!fundingFavorsUs) {
        exitReason = "funding_flipped"; // funding direction changed — we're now paying
      } else if (currentAPR < config.exitAPR) {
        exitReason = "funding_reverted"; // magnitude dropped below exit threshold
      }

      if (exitReason) {
        // Close the position via market order
        var closedOk = false;
        try {
          await hl.custom.marketClose(trade.coin);
          closedOk = true;
        } catch (e: any) {
          journal.logAction("WARN", "marketClose " + trade.coin + " failed: " + e.message + " — trying manual close");

          // Fallback: manual close using exchange.placeOrder directly
          try {
            var closeSzi = pos ? parseFloat(pos.position.szi) : 0;
            var closeSz = Math.abs(closeSzi);
            var closeIsBuy = closeSzi < 0;
            var closeLimitPx = roundPx(closeIsBuy ? midPrice * 1.05 : midPrice * 0.95);

            if (closeSz > 0) {
              await hl.exchange.placeOrder({
                coin: toPerpCoin(trade.coin),
                is_buy: closeIsBuy,
                sz: closeSz,
                limit_px: closeLimitPx,
                order_type: { limit: { tif: "Ioc" as any } },
                reduce_only: true,
              });
              closedOk = true;
              journal.logAction("CLOSE", trade.coin + " closed via manual fallback");
            }
          } catch (e2: any) {
            journal.logAction("ERROR", "Manual close " + trade.coin + ": " + e2.message);
            result.errors.push("Close " + trade.coin + ": " + e2.message);
          }
        }

        if (closedOk) {
          await journal.closeTrade(trade.id, midPrice, currentAPR, exitReason, unrealizedPnl, cumFunding);
          result.closed.push(trade.coin + ":" + exitReason);

          var totalPnl = unrealizedPnl + cumFunding;
          var balInfo = await getAccountStatus();
          sendAlert(exitReason === "stop_loss" ? "\uD83D\uDEA8" : "\uD83D\uDD34",
            "CLOSE " + trade.coin + " " + trade.direction.toUpperCase(),
            [
              "Reason: " + exitReason,
              "Trade P&L: $" + totalPnl.toFixed(2) + " (price: $" + unrealizedPnl.toFixed(2) + ", funding: $" + cumFunding.toFixed(4) + ")",
              "Exit Price: $" + fmtPx(midPrice),
              "Balance: $" + balInfo.balance.toFixed(2),
            ]).catch(function() {});
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
      });
    }
  });

  result.scanned = meta.universe.length;

  // Sort by highest absolute funding rate
  opportunities.sort(function(a, b) { return Math.abs(b.fundingAPR) - Math.abs(a.fundingAPR); });

  journal.logAction("SCAN", "Found " + opportunities.length + " opportunities above " + (config.entryAPR * 100).toFixed(0) + "% APR");

  for (var opp of opportunities) {
    if (openCount >= config.maxPositions) break;

    // Skip if already have position (filter by current mode)
    if (await journal.isAlreadyOpen(opp.coin, isPaper ? true : undefined)) {
      result.skipped.push(opp.coin + ":already_open");
      continue;
    }

    // Calculate position size
    var lev = Math.min(config.leverage, opp.maxLev);
    var notional = config.maxPositionUSD * lev;
    var rawSize = notional / opp.midPrice;
    var size = parseFloat(rawSize.toFixed(opp.szDecimals));

    if (size <= 0) {
      result.skipped.push(opp.coin + ":size_zero");
      continue;
    }

    if (isPaper) {
      // ── Paper mode: simulate fill at mid price ──
      try {
        var fillPrice = opp.midPrice;
        var priceMoveThreshold = config.stopLossPct / (lev * 100);
        var simStopPrice = opp.direction === "short"
          ? roundSigFigs(fillPrice * (1 + priceMoveThreshold), 5)
          : roundSigFigs(fillPrice * (1 - priceMoveThreshold), 5);

        var paperTrade: BotTrade = {
          id: genId(),
          coin: opp.coin,
          direction: opp.direction,
          sizeUSD: config.maxPositionUSD,
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
          spotHedge: false,
          spotEntryPrice: null,
          spotExitPrice: null,
          paper: true,
          lastFundingCheck: Date.now(),
          stopPrice: simStopPrice,
        };

        await journal.addTrade(paperTrade);
        journal.logAction("OPEN", "[PAPER] " + opp.coin + " " + opp.direction.toUpperCase() +
          " $" + config.maxPositionUSD + " @ $" + fmtPx(fillPrice) +
          " (APR: " + (opp.fundingAPR * 100).toFixed(0) + "%, SL: $" + fmtPx(simStopPrice) + ")");

        sendAlert("\uD83D\uDCDD", "[PAPER] OPEN " + opp.coin + " " + opp.direction.toUpperCase(), [
          "Size: $" + config.maxPositionUSD + " @ " + lev + "x",
          "Price: $" + fmtPx(fillPrice),
          "APR: " + (opp.fundingAPR * 100).toFixed(0) + "%",
          "Stop-Loss: $" + fmtPx(simStopPrice),
          "Paper Balance: $" + config.paperBalance.toFixed(2),
        ]).catch(function() {});

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
        await hl.exchange.updateLeverage(opp.coin, "cross", lev);

        // Place market order
        var isBuy = opp.direction === "long";
        var orderResult = await hl.custom.marketOpen(opp.coin, isBuy, size);

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
            "Size: $" + config.maxPositionUSD + " @ " + lev + "x",
          ]).catch(function() {});
          result.errors.push(opp.coin + ": " + rejectMsg);
          continue; // Skip — no position opened, don't record trade
        }

        journal.logAction("OPEN", opp.coin + " " + opp.direction.toUpperCase() +
          " $" + config.maxPositionUSD + " @ $" + fmtPx(fillPrice) +
          " (APR: " + (opp.fundingAPR * 100).toFixed(0) + "%, filled " + fillSize + ")");

        // Record trade
        var trade: BotTrade = {
          id: genId(),
          coin: opp.coin,
          direction: opp.direction,
          sizeUSD: config.maxPositionUSD,
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
          spotHedge: false,
          spotEntryPrice: null,
          spotExitPrice: null,
          paper: false,
          lastFundingCheck: Date.now(),
          stopPrice: null,
        };

        await journal.addTrade(trade);

        // Place stop-loss order directly on Hyperliquid for instant execution
        try {
          var priceMoveThreshold = config.stopLossPct / (lev * 100);
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
        } catch (slErr: any) {
          journal.logAction("WARN", "Stop-loss placement failed for " + opp.coin + ": " + slErr.message);
        }

        // Telegram alert for new trade
        var balInfo = await getAccountStatus();
        sendAlert("\uD83D\uDFE2", "OPEN " + opp.coin + " " + opp.direction.toUpperCase(), [
          "Size: $" + config.maxPositionUSD + " @ " + lev + "x",
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

  // Direct raw fetch to testnet API (bypass SDK to compare)
  try {
    var testnetUrl = config.testnet
      ? "https://api.hyperliquid-testnet.xyz/info"
      : "https://api.hyperliquid.xyz/info";
    debug.directApiUrl = testnetUrl;

    var rawRes = await fetch(testnetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "clearinghouseState", user: walletAddr }),
    });
    var rawJson = await rawRes.json();
    debug.directBalance = rawJson.marginSummary ? rawJson.marginSummary.accountValue : "no_margin_summary";
    debug.directRawKeys = rawJson ? Object.keys(rawJson) : [];
  } catch (e: any) {
    debug.directError = e.message;
  }

  // Also check mainnet for comparison
  try {
    var mainUrl = "https://api.hyperliquid.xyz/info";
    var mainRes = await fetch(mainUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "clearinghouseState", user: walletAddr }),
    });
    var mainJson = await mainRes.json();
    debug.mainnetBalance = mainJson.marginSummary ? mainJson.marginSummary.accountValue : "no_margin_summary";
  } catch (e: any) {
    debug.mainnetError = e.message;
  }

  try {
    var hl = await getSDK(config);
    debug.sdkBaseUrl = (hl as any).baseUrl || "unknown";

    var state = await hl.info.perpetuals.getClearinghouseState(walletAddr);
    debug.sdkBalance = state.marginSummary.accountValue;

    return {
      balance: parseFloat(state.marginSummary.accountValue),
      marginUsed: parseFloat(state.marginSummary.totalMarginUsed),
      positions: state.assetPositions.map(function(p) {
        return {
          coin: p.position.coin,
          size: p.position.szi,
          entryPx: p.position.entryPx,
          unrealizedPnl: p.position.unrealizedPnl,
          leverage: p.position.leverage.value,
        };
      }).filter(function(p) { return parseFloat(p.size) !== 0; }),
      walletAddress: walletAddr,
      error: "",
      debug: debug,
    };
  } catch (e: any) {
    var errMsg = e.message || "Unknown error";
    journal.logAction("ERROR", "Account status: " + errMsg);
    debug.sdkError = errMsg;
    return { balance: 0, marginUsed: 0, positions: [], walletAddress: walletAddr, error: errMsg, debug: debug };
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

    var state = await hl.info.perpetuals.getClearinghouseState(walletAddr);
    var mids = await hl.info.getAllMids();

    for (var pos of state.assetPositions) {
      var coin = pos.position.coin;
      var size = parseFloat(pos.position.szi);
      if (size === 0) continue;

      result[coin] = {
        unrealizedPnl: parseFloat(pos.position.unrealizedPnl),
        cumFunding: parseFloat(pos.position.cumFunding.sinceOpen),
        midPrice: mids[coin] ? parseFloat(mids[coin]) : parseFloat(pos.position.entryPx),
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

// ── Get current funding rates for all perps ──
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
  } catch (e: any) {
    journal.logAction("ERROR", "getFundingRates: " + e.message);
  }

  return rates;
}
