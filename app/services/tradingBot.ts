// ═══ Trading Bot Engine ═══
// Connects to Hyperliquid via SDK, scans funding rates, opens/closes positions.

import { Hyperliquid } from "hyperliquid";
import { ethers } from "ethers";
import { readFileSync } from "fs";
import type { BotTrade, BotConfig } from "../types";
import * as journal from "./tradeJournal";

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

// ── Generate unique trade ID ──
function genId(): string {
  return "t_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
}

// ── Main bot tick ──
export async function botTick(): Promise<{
  scanned: number;
  opened: string[];
  closed: string[];
  skipped: string[];
  errors: string[];
}> {
  var config = journal.getConfig();
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
    hl = await getSDK(config);
  } catch (e: any) {
    journal.logAction("ERROR", "SDK init: " + e.message);
    result.errors.push("SDK init: " + e.message);
    return result;
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

// ── Check existing positions for exit conditions ──
async function checkExistingPositions(
  hl: Hyperliquid,
  config: BotConfig,
  result: { closed: string[]; errors: string[] }
): Promise<void> {
  var openTrades = journal.getOpenTrades();
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

      // Check exit conditions
      var lossPct = Math.abs(unrealizedPnl) / trade.sizeUSD * 100;
      if (unrealizedPnl < 0 && lossPct > config.stopLossPct) {
        exitReason = "stop_loss";
      } else if (holdHours > config.maxHoldHours) {
        exitReason = "max_hold";
      } else if (currentAPR < config.exitAPR) {
        exitReason = "funding_reverted";
      }

      if (exitReason) {
        // Close the position via market order
        try {
          await hl.custom.marketClose(trade.coin);
          journal.closeTrade(trade.id, midPrice, currentAPR, exitReason, unrealizedPnl, cumFunding);
          result.closed.push(trade.coin + ":" + exitReason);
        } catch (e: any) {
          journal.logAction("ERROR", "Close " + trade.coin + ": " + e.message);
          result.errors.push("Close " + trade.coin + ": " + e.message);
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
  var openCount = journal.getOpenTrades().length;
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

    // Skip if already have position
    if (journal.isAlreadyOpen(opp.coin)) {
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

    try {
      // Set leverage
      await hl.exchange.updateLeverage(opp.coin, "cross", lev);

      // Place market order
      var isBuy = opp.direction === "long";
      var orderResult = await hl.custom.marketOpen(opp.coin, isBuy, size);

      // Determine fill price
      var fillPrice = opp.midPrice;
      if (orderResult && orderResult.response && orderResult.response.data && orderResult.response.data.statuses) {
        var statuses = orderResult.response.data.statuses;
        if (statuses[0] && statuses[0].filled) {
          fillPrice = parseFloat(statuses[0].filled.avgPx);
        }
      }

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
      };

      journal.addTrade(trade);
      result.opened.push(opp.coin + ":" + opp.direction + " @ $" + fillPrice.toFixed(2));
      openCount++;

    } catch (e: any) {
      journal.logAction("ERROR", "Open " + opp.coin + ": " + e.message);
      result.errors.push("Open " + opp.coin + ": " + e.message);
    }
  }
}

// ── Get account status ──
export async function getAccountStatus(): Promise<{
  balance: number;
  marginUsed: number;
  positions: Array<{ coin: string; size: string; entryPx: string; unrealizedPnl: string; leverage: number }>;
}> {
  var config = journal.getConfig();
  if (!getPrivateKey()) {
    return { balance: 0, marginUsed: 0, positions: [] };
  }

  try {
    var hl = await getSDK(config);
    var walletAddress = getWalletAddress();

    var state = await hl.info.perpetuals.getClearinghouseState(walletAddress);
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
    };
  } catch (e: any) {
    journal.logAction("ERROR", "Account status: " + e.message);
    return { balance: 0, marginUsed: 0, positions: [] };
  }
}
