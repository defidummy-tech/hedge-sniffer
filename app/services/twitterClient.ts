// ═══ Twitter/X posting client for deal alerts ═══

import { TwitterApi } from "twitter-api-v2";
import type { Asset, Deal } from "../types";

var REFERRAL_LINK = "https://app.hyperliquid.xyz/join/DEFIDUMMY";

// ── Rotating intro pools ──

var HIGH_INTROS = [
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

var SUSTAINED_INTROS = [
  "\uD83D\uDD25 Sustained funding alert!",
  "\uD83D\uDEA8 This funding rate won't quit!",
  "\u26A1 Persistently high funding detected!",
  "\uD83D\uDCCA Extended high-funding opportunity!",
  "\uD83D\uDD14 Long-running funding rate alert!",
];

var DEAL_INTROS = [
  "\uD83C\uDFAF Hedge deal detected!",
  "\uD83D\uDD25 DeFiDummy found a funding harvest opportunity!",
  "\uD83D\uDCB0 Funding harvest deal alert!",
  "\u26A1 I just sniffed out a sweet hedge deal!",
  "\uD83D\uDEA8 DeFiDummy's deal scanner just found this!",
];

function pickRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Tiered cooldown tracking ──
// Key format: "SYM:type" e.g. "BTC:high", "OPENAI:sustained", "SOL:deal"

var lastTweetByKey: Map<string, number> = new Map();
var lastTweetGlobal: number = 0;
var GLOBAL_COOLDOWN = 2 * 60 * 1000; // 2 minutes between any tweets

function getCooldownMs(type: string): number {
  if (type === "sustained") {
    var hours = parseFloat(process.env.TWEET_COOLDOWN_SUSTAINED_HOURS || "24");
    return hours * 60 * 60 * 1000;
  }
  if (type === "deal") {
    var dHours = parseFloat(process.env.TWEET_COOLDOWN_DEAL_HOURS || "8");
    return dHours * 60 * 60 * 1000;
  }
  // "high" (default)
  var hHours = parseFloat(process.env.TWEET_COOLDOWN_HIGH_HOURS || "4");
  return hHours * 60 * 60 * 1000;
}

/** Check if an asset+type combo is in cooldown */
export function isInCooldown(sym: string, type?: string): boolean {
  var now = Date.now();
  if (now - lastTweetGlobal < GLOBAL_COOLDOWN) return true;
  var key = sym + ":" + (type || "high");
  var lastTime = lastTweetByKey.get(key);
  if (lastTime && now - lastTime < getCooldownMs(type || "high")) return true;
  return false;
}

/** Record that a tweet was sent */
function recordTweet(sym: string, type?: string): void {
  var now = Date.now();
  lastTweetByKey.set(sym + ":" + (type || "high"), now);
  lastTweetGlobal = now;
}

// ── Tweet formatting: High Funding Rate ──

export function formatTweet(asset: Asset): string {
  var absAPR = Math.abs(asset.fundingRateAPR || 0);
  var aprPct = absAPR >= 1 ? (absAPR * 100).toFixed(0) : (absAPR * 100).toFixed(1);
  var dir = (asset.fundingRate || 0) > 0 ? "Short" : "Long";
  var hourlyPer1K = Math.abs((asset.fundingRate || 0)) * 1000;

  var lines: string[] = [];
  lines.push(pickRandom(HIGH_INTROS));
  lines.push("");
  lines.push("$" + asset.sym + " at " + aprPct + "% APR on Hyperliquid right now!");
  lines.push("\uD83D\uDCB0 " + dir + " to earn ~$" + hourlyPer1K.toFixed(2) + "/hr per $1K");

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
  lines.push("Follow DeFiDummy for more trading signals \uD83D\uDC15");

  var tweet = lines.join("\n");
  var tags = "\n\n#DeFi #Hyperliquid";
  if (tweet.length + tags.length <= 280) tweet += tags;
  if (tweet.length > 280) tweet = tweet.slice(0, 277) + "...";
  return tweet;
}

// ── Tweet formatting: Sustained Funding ──

export function formatSustainedTweet(asset: Asset, avgAPR: number, days: number): string {
  var aprPct = avgAPR >= 1 ? (avgAPR * 100).toFixed(0) : (avgAPR * 100).toFixed(1);
  var dir = (asset.fundingRate || 0) > 0 ? "Short" : "Long";
  var currentPct = Math.abs((asset.fundingRateAPR || 0) * 100);
  var currentStr = currentPct >= 100 ? currentPct.toFixed(0) : currentPct.toFixed(1);

  var lines: string[] = [];
  lines.push(pickRandom(SUSTAINED_INTROS));
  lines.push("");
  lines.push("$" + asset.sym + " has maintained " + aprPct + "%+ APR for over " + days + " days!");
  lines.push("");
  lines.push("\uD83D\uDCCA Current: " + currentStr + "% APR");
  lines.push("\uD83D\uDCB0 " + dir + " to earn sustained funding income");
  lines.push("");
  lines.push("Trade here \u2192 " + REFERRAL_LINK);
  lines.push("");
  lines.push("Follow DeFiDummy for more trading signals \uD83D\uDC15");

  var tweet = lines.join("\n");
  var tags = "\n\n#DeFi #Hyperliquid #FundingRate";
  if (tweet.length + tags.length <= 280) tweet += tags;
  if (tweet.length > 280) tweet = tweet.slice(0, 277) + "...";
  return tweet;
}

// ── Tweet formatting: Deal Alert ──

export function formatDealTweet(deal: Deal): string {
  var aprPct = Math.abs(deal.fundingAPR * 100);
  var aprStr = aprPct >= 100 ? aprPct.toFixed(0) : aprPct.toFixed(1);
  var dir = deal.fundingAPR > 0 ? "SHORT" : "LONG";

  var lines: string[] = [];
  lines.push(pickRandom(DEAL_INTROS));
  lines.push("");
  lines.push("$" + deal.sym + " \u2014 " + dir + " at " + aprStr + "% APR");
  lines.push(deal.description);

  if (deal.netYieldAPR > 0) {
    lines.push("\uD83D\uDCCA Est. net yield: ~" + (deal.netYieldAPR * 100).toFixed(0) + "% APR");
  }

  lines.push("");
  lines.push("Trade here \u2192 " + REFERRAL_LINK);
  lines.push("");
  lines.push("Follow DeFiDummy for more trading signals \uD83D\uDC15");

  var tweet = lines.join("\n");
  var tags = "\n\n#DeFi #Hyperliquid";
  if (tweet.length + tags.length <= 280) tweet += tags;
  if (tweet.length > 280) tweet = tweet.slice(0, 277) + "...";
  return tweet;
}

// ── Chart generation via QuickChart.io ──

export interface FundingHistoryPoint {
  time: number;
  fundingRate: number;
  premium: number;
}

/** Build a QuickChart.io URL for a 7-day funding rate chart */
export function buildFundingChartUrl(sym: string, history: FundingHistoryPoint[]): string {
  // Sample to max 168 points (hourly for 7 days) — take every Nth point if needed
  var maxPoints = 168;
  var step = Math.max(1, Math.floor(history.length / maxPoints));
  var labels: string[] = [];
  var data: number[] = [];

  for (var i = 0; i < history.length; i += step) {
    var d = new Date(history[i].time);
    // Label format: "Feb 21" or "Feb 21 14h"
    var month = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()];
    labels.push(month + " " + d.getUTCDate());
    data.push(+(Math.abs(history[i].fundingRate * 8760) * 100).toFixed(1)); // APR as percentage
  }

  var chartConfig = {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "$" + sym + " Funding Rate APR %",
        data: data,
        borderColor: "#22c55e",
        backgroundColor: "rgba(34, 197, 94, 0.15)",
        fill: true,
        pointRadius: 0,
        borderWidth: 2,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: "$" + sym + " \u2014 7-Day Funding Rate",
          color: "#ffffff",
          font: { size: 18, weight: "bold" },
        },
        legend: { display: false },
      },
      scales: {
        x: {
          ticks: { color: "#9ca3af", maxTicksLimit: 7 },
          grid: { color: "rgba(255,255,255,0.05)" },
        },
        y: {
          ticks: {
            color: "#9ca3af",
            callback: function(v: number) { return v + "%"; },
          },
          grid: { color: "rgba(255,255,255,0.08)" },
          title: { display: true, text: "APR %", color: "#9ca3af" },
        },
      },
    },
  };

  var configStr = encodeURIComponent(JSON.stringify(chartConfig));
  return "https://quickchart.io/chart?c=" + configStr + "&w=600&h=350&bkg=%23111827&f=png";
}

/** Download chart image and upload to Twitter, returns media_id */
async function uploadChartToTwitter(chartUrl: string): Promise<string | null> {
  var client = getTwitterClient();
  if (!client) return null;

  try {
    // Download chart PNG from QuickChart
    var res = await fetch(chartUrl);
    if (!res.ok) {
      console.error("QuickChart fetch failed:", res.status);
      return null;
    }
    var buffer = Buffer.from(await res.arrayBuffer());

    // Upload to Twitter
    var mediaId = await client.v1.uploadMedia(buffer, { mimeType: "image/png" });
    return mediaId;
  } catch (err: any) {
    console.error("Chart upload failed:", err?.message || err);
    return null;
  }
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

/** Post a tweet (text only). Returns tweet ID on success, throws on failure. */
export async function postTweet(text: string): Promise<string> {
  var client = getTwitterClient();
  if (!client) throw new Error("Twitter credentials not configured \u2014 check env vars");

  var result = await client.v2.tweet(text);
  return result.data.id;
}

/** Post a tweet with media. Returns tweet ID on success, throws on failure. */
export async function postTweetWithMedia(text: string, mediaId: string): Promise<string> {
  var client = getTwitterClient();
  if (!client) throw new Error("Twitter credentials not configured \u2014 check env vars");

  var result = await client.v2.tweet(text, { media: { media_ids: [mediaId] } });
  return result.data.id;
}

// ── Process functions (one per tweet type) ──

export interface TweetResult {
  posted: boolean;
  reason: string;
  tweetId?: string;
  tweetText?: string;
  type?: string;
}

/** Process a high-funding alert: format, check cooldown, post tweet */
export async function processHighAlert(asset: Asset): Promise<TweetResult> {
  if (isInCooldown(asset.sym, "high")) {
    return { posted: false, reason: "cooldown", type: "high" };
  }

  var text = formatTweet(asset);

  try {
    var tweetId = await postTweet(text);
    recordTweet(asset.sym, "high");
    return { posted: true, reason: "success", tweetId: tweetId, tweetText: text, type: "high" };
  } catch (err: any) {
    var msg = err?.data?.detail || err?.data?.title || err?.message || "unknown";
    console.error("High tweet failed for " + asset.sym + ":", err?.data || msg);
    return { posted: false, reason: "api_error: " + msg, type: "high" };
  }
}

/** Process a sustained-funding alert: format, generate chart, post tweet with image */
export async function processSustainedAlert(
  asset: Asset,
  avgAPR: number,
  days: number,
  history: FundingHistoryPoint[]
): Promise<TweetResult> {
  if (isInCooldown(asset.sym, "sustained")) {
    return { posted: false, reason: "cooldown_sustained", type: "sustained" };
  }

  var text = formatSustainedTweet(asset, avgAPR, days);

  try {
    // Try to generate and upload chart image
    var chartUrl = buildFundingChartUrl(asset.sym, history);
    var mediaId = await uploadChartToTwitter(chartUrl);

    var tweetId: string;
    if (mediaId) {
      tweetId = await postTweetWithMedia(text, mediaId);
    } else {
      // Fallback: post without image
      tweetId = await postTweet(text);
    }

    recordTweet(asset.sym, "sustained");
    return { posted: true, reason: "success", tweetId: tweetId, tweetText: text, type: "sustained" };
  } catch (err: any) {
    var msg = err?.data?.detail || err?.data?.title || err?.message || "unknown";
    console.error("Sustained tweet failed for " + asset.sym + ":", err?.data || msg);
    return { posted: false, reason: "api_error: " + msg, type: "sustained" };
  }
}

/** Process a deal alert: format and post tweet */
export async function processDealTweet(deal: Deal): Promise<TweetResult> {
  if (isInCooldown(deal.sym, "deal")) {
    return { posted: false, reason: "cooldown_deal", type: "deal" };
  }

  var text = formatDealTweet(deal);

  try {
    var tweetId = await postTweet(text);
    recordTweet(deal.sym, "deal");
    return { posted: true, reason: "success", tweetId: tweetId, tweetText: text, type: "deal" };
  } catch (err: any) {
    var msg = err?.data?.detail || err?.data?.title || err?.message || "unknown";
    console.error("Deal tweet failed for " + deal.sym + ":", err?.data || msg);
    return { posted: false, reason: "api_error: " + msg, type: "deal" };
  }
}

// Keep backward-compatible export name
export var processDealAlert = processHighAlert;
