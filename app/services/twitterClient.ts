// ═══ Twitter/X posting client for deal alerts ═══

import { TwitterApi } from "twitter-api-v2";
import type { Asset } from "../types";

var REFERRAL_LINK = "https://app.hyperliquid.xyz/join/DEFIDUMMY";

// ── Rotating intro pool ──

var INTROS = [
  "\uD83D\uDEA8 Just detected a massive funding rate opportunity!",
  "\uD83D\uDD25 I just sniffed out this deal on Hyperliquid!",
  "\uD83D\uDCB0 Huge funding rate alert right now!",
  "\uD83C\uDFAF DeFiDummy just found a juicy funding harvest!",
  "\u26A1 Funding rate spike detected right now!",
  "\uD83D\uDEA8 My deal sniffer just picked this up!",
  "\uD83D\uDD14 Alert! Insane funding rate just detected!",
  "\uD83D\uDCCA DeFiDummy sniffed out another big one!",
  "\uD83D\uDE80 Just spotted this funding rate opportunity!",
  "\uD83D\uDEA8 This one's hot \u2014 huge funding rate right now!",
];

function randomIntro(): string {
  return INTROS[Math.floor(Math.random() * INTROS.length)];
}

// ── Cooldown tracking (in-memory, survives across requests in same process) ──

var lastTweetByAsset: Map<string, number> = new Map();
var lastTweetGlobal: number = 0;
var ASSET_COOLDOWN = 4 * 60 * 60 * 1000;   // 4 hours per asset
var GLOBAL_COOLDOWN = 2 * 60 * 1000;        // 2 minutes between any tweets

/** Check if an asset is in cooldown */
export function isInCooldown(sym: string): boolean {
  var now = Date.now();
  if (now - lastTweetGlobal < GLOBAL_COOLDOWN) return true;
  var lastTime = lastTweetByAsset.get(sym);
  if (lastTime && now - lastTime < ASSET_COOLDOWN) return true;
  return false;
}

/** Record that a tweet was sent for an asset */
function recordTweet(sym: string): void {
  var now = Date.now();
  lastTweetByAsset.set(sym, now);
  lastTweetGlobal = now;
}

// ── Tweet formatting ──

export function formatTweet(asset: Asset): string {
  var absAPR = Math.abs(asset.fundingRateAPR || 0);
  var aprPct = absAPR >= 1 ? (absAPR * 100).toFixed(0) : (absAPR * 100).toFixed(1);
  var dir = (asset.fundingRate || 0) > 0 ? "Short" : "Long";
  var hourlyPer1K = Math.abs((asset.fundingRate || 0)) * 1000;

  var lines: string[] = [];

  // Random intro
  lines.push(randomIntro());
  lines.push("");

  // Asset + APR
  lines.push("$" + asset.sym + " at " + aprPct + "% APR on Hyperliquid right now!");

  // Earnings
  lines.push("\uD83D\uDCB0 " + dir + " to earn ~$" + hourlyPer1K.toFixed(2) + "/hr per $1K");

  // OI if available
  if (asset.openInterest > 0) {
    var oiStr = asset.openInterest >= 1e9
      ? "$" + (asset.openInterest / 1e9).toFixed(1) + "B"
      : asset.openInterest >= 1e6
        ? "$" + (asset.openInterest / 1e6).toFixed(1) + "M"
        : "$" + (asset.openInterest / 1e3).toFixed(0) + "K";
    lines.push("\uD83D\uDCCA OI: " + oiStr);
  }

  lines.push("");
  lines.push("Trade here \u2192 " + REFERRAL_LINK);
  lines.push("");
  lines.push("Follow @DeFiDummy for more trading signals \uD83D\uDC15");

  var tweet = lines.join("\n");

  // Add hashtags if space permits
  var tags = "\n\n#DeFi #Hyperliquid";
  if (tweet.length + tags.length <= 280) {
    tweet += tags;
  }

  // Safety: truncate if somehow over 280
  if (tweet.length > 280) {
    tweet = tweet.slice(0, 277) + "...";
  }

  return tweet;
}

// ── Twitter API client ──

function getTwitterClient(): TwitterApi | null {
  var appKey = process.env.TWITTER_CONSUMER_KEY;
  var appSecret = process.env.TWITTER_CONSUMER_SECRET;
  var accessToken = process.env.TWITTER_ACCESS_TOKEN;
  var accessSecret = process.env.TWITTER_ACCESS_SECRET;

  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    console.warn("Twitter credentials not configured");
    return null;
  }

  return new TwitterApi({
    appKey: appKey,
    appSecret: appSecret,
    accessToken: accessToken,
    accessSecret: accessSecret,
  });
}

/** Post a tweet. Returns tweet ID on success, throws on failure. */
export async function postTweet(text: string): Promise<string> {
  var client = getTwitterClient();
  if (!client) throw new Error("Twitter credentials not configured — check env vars");

  var result = await client.v2.tweet(text);
  return result.data.id;
}

/** Process a high-funding deal: format, check cooldown, post tweet */
export async function processDealAlert(asset: Asset): Promise<{
  posted: boolean;
  reason: string;
  tweetId?: string;
  tweetText?: string;
}> {
  if (isInCooldown(asset.sym)) {
    return { posted: false, reason: "cooldown" };
  }

  var text = formatTweet(asset);

  try {
    var tweetId = await postTweet(text);
    recordTweet(asset.sym);
    return { posted: true, reason: "success", tweetId: tweetId, tweetText: text };
  } catch (err: any) {
    var msg = err?.data?.detail || err?.data?.title || err?.message || "unknown";
    console.error("Tweet failed for " + asset.sym + ":", err?.data || msg);
    return { posted: false, reason: "api_error: " + msg };
  }
}
