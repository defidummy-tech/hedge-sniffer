// ═══ Cron endpoint: scan for opportunities and tweet alerts ═══
//
// All thresholds are configurable via Render environment variables.
// See the env var table below for defaults.
//
// ┌─────────────────────────────────────┬─────────┬──────────────────────────────────────┐
// │ Variable                            │ Default │ Description                          │
// ├─────────────────────────────────────┼─────────┼──────────────────────────────────────┤
// │ CRON_SECRET                         │ (none)  │ Bearer token to protect this endpoint│
// │ TWEET_THRESHOLD_EXTREME_APR         │ 5.0     │ 500% — any asset gets tweeted        │
// │ TWEET_THRESHOLD_HIGH_APR            │ 1.0     │ 100% — known assets only             │
// │ TWEET_THRESHOLD_SUSTAINED_APR       │ 2.0     │ 200% avg APR for sustained alerts    │
// │ TWEET_SUSTAINED_DAYS               │ 7       │ Lookback period in days               │
// │ TWEET_DEAL_MIN_SCORE               │ 50      │ Min deal scanner score to tweet        │
// │ TWEET_DEAL_MIN_APR                 │ 0.5     │ 50% min APR for deal tweets            │
// │ TWEET_COOLDOWN_HIGH_HOURS          │ 4       │ Per-asset cooldown for high tweets     │
// │ TWEET_COOLDOWN_SUSTAINED_HOURS     │ 24      │ Per-asset cooldown for sustained       │
// │ TWEET_COOLDOWN_DEAL_HOURS          │ 8       │ Per-asset cooldown for deal tweets     │
// │ TWEET_ENABLE_HIGH                  │ true    │ Toggle high-funding tweets             │
// │ TWEET_ENABLE_SUSTAINED             │ true    │ Toggle sustained-funding tweets        │
// │ TWEET_ENABLE_DEALS                 │ true    │ Toggle deal alert tweets               │
// │ TWEET_GLOBAL_COOLDOWN_MINUTES      │ 30      │ Min minutes between ANY tweets         │
// └─────────────────────────────────────┴─────────┴──────────────────────────────────────┘

import { NextResponse } from "next/server";
import { fetchAssetsForCron, fetchFundingHistoryServer } from "../../../services/serverDataFetcher";
import {
  isInCooldown,
  processHighAlert,
  processSustainedAlert,
  processDealTweet,
  setGlobalCooldownMs,
  setCooldownHours,
} from "../../../services/twitterClient";
import type { FundingHistoryPoint } from "../../../services/twitterClient";
import { scanDeals } from "../../../services/dealScanner";
import { PRIORITY_MAPPINGS } from "../../../services/marketMapping";
import * as journal from "../../../services/tradeJournal";

// Known asset syms from priority mappings
var KNOWN_SYMS = new Set(PRIORITY_MAPPINGS.map(function(m) { return m.sym; }));

export async function GET(request: Request) {
  // Auth check
  var authHeader = request.headers.get("authorization") || "";
  var cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== "Bearer " + cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  var startTime = Date.now();
  var scanned = 0;
  var posted: Array<{ sym: string; apr: string; type: string; tweetId?: string }> = [];
  var skipped: Array<{ sym: string; reason: string; type: string }> = [];
  var errors: string[] = [];
  var stats = { highQualified: 0, sustainedCandidates: 0, sustainedQualified: 0, dealsFound: 0, dealsQualified: 0 };

  try {
    // ── Load tweet config from storage (UI-configurable) ──
    var tc = await journal.getTweetConfig();
    var EXTREME_APR = tc.extremeAPR;
    var HIGH_APR = tc.highAPR;
    var SUSTAINED_APR = tc.sustainedAPR;
    var SUSTAINED_DAYS = tc.sustainedDays;
    var DEAL_MIN_SCORE = tc.dealMinScore;
    var DEAL_MIN_APR = tc.dealMinAPR;
    var ENABLE_HIGH = tc.enableHigh;
    var ENABLE_SUSTAINED = tc.enableSustained;
    var ENABLE_DEALS = tc.enableDeals;
    var MAX_TWEETS_PER_RUN = tc.maxTweetsPerRun;

    // Update runtime cooldowns from config
    setGlobalCooldownMs(tc.globalCooldownMinutes * 60 * 1000);
    setCooldownHours(tc.cooldownHighHours, tc.cooldownSustainedHours, tc.cooldownDealHours);

    // ── Fetch all assets from Hyperliquid ──
    var assets = await fetchAssetsForCron();
    scanned = assets.length;

    // ════════════════════════════════════════════
    // PASS 1: High funding rate alerts (existing)
    // ════════════════════════════════════════════
    if (ENABLE_HIGH) {
      for (var i = 0; i < assets.length; i++) {
        var asset = assets[i];
        var absAPR = Math.abs(asset.fundingRateAPR || 0);

        var qualifies = false;
        if (absAPR >= EXTREME_APR) {
          qualifies = true;
        } else if (absAPR >= HIGH_APR && KNOWN_SYMS.has(asset.sym)) {
          qualifies = true;
        }
        if (!qualifies) continue;
        stats.highQualified++;

        if (isInCooldown(asset.sym, "high")) {
          skipped.push({ sym: asset.sym, reason: "cooldown", type: "high" });
          continue;
        }

        try {
          var hResult = await processHighAlert(asset);
          if (hResult.posted) {
            posted.push({ sym: asset.sym, apr: (absAPR * 100).toFixed(0) + "%", type: "high", tweetId: hResult.tweetId });
          } else {
            skipped.push({ sym: asset.sym, reason: hResult.reason, type: "high" });
          }
        } catch (err: any) {
          errors.push("high:" + asset.sym + ": " + (err?.message || "unknown"));
        }
      }
    }

    // ════════════════════════════════════════════
    // PASS 2: Sustained high funding (7-day avg)
    // ════════════════════════════════════════════
    var tweetsThisRun = posted.length;
    if (ENABLE_SUSTAINED && tweetsThisRun < MAX_TWEETS_PER_RUN) {
      // Pre-filter: only check assets with current APR above half the threshold
      var sustainedCandidates = [];
      for (var si = 0; si < assets.length; si++) {
        if (Math.abs(assets[si].fundingRateAPR || 0) >= SUSTAINED_APR * 0.5) {
          sustainedCandidates.push(assets[si]);
        }
      }
      stats.sustainedCandidates = sustainedCandidates.length;

      // Fetch funding history in parallel for candidates
      var historyResults = await Promise.allSettled(
        sustainedCandidates.map(function(a) {
          var coin = a.coin || a.sym;
          return fetchFundingHistoryServer(coin, SUSTAINED_DAYS);
        })
      );

      for (var sj = 0; sj < sustainedCandidates.length; sj++) {
        var sAsset = sustainedCandidates[sj];
        var hr = historyResults[sj];
        if (hr.status !== "fulfilled" || hr.value.length === 0) continue;

        var history: FundingHistoryPoint[] = hr.value;

        // Calculate average absolute APR over the period
        var sum = 0;
        for (var hi = 0; hi < history.length; hi++) {
          sum += Math.abs(history[hi].fundingRate * 8760);
        }
        var avgAPR = sum / history.length;

        // Need enough data: 80% of expected hourly points
        var expectedPoints = SUSTAINED_DAYS * 24;
        if (history.length < expectedPoints * 0.8) continue;

        // Check if average APR exceeds threshold
        if (avgAPR < SUSTAINED_APR) continue;
        stats.sustainedQualified++;

        if (isInCooldown(sAsset.sym, "sustained")) {
          skipped.push({ sym: sAsset.sym, reason: "cooldown_sustained", type: "sustained" });
          continue;
        }

        try {
          var sResult = await processSustainedAlert(sAsset, avgAPR, SUSTAINED_DAYS, history);
          if (sResult.posted) {
            posted.push({ sym: sAsset.sym, apr: (avgAPR * 100).toFixed(0) + "% avg", type: "sustained", tweetId: sResult.tweetId });
          } else {
            skipped.push({ sym: sAsset.sym, reason: sResult.reason, type: "sustained" });
          }
        } catch (err: any) {
          errors.push("sustained:" + sAsset.sym + ": " + (err?.message || "unknown"));
        }
      }
    }

    // ════════════════════════════════════════════
    // PASS 3: Deal alerts (funding_harvest deals)
    // ════════════════════════════════════════════
    tweetsThisRun = posted.length;
    if (ENABLE_DEALS && tweetsThisRun < MAX_TWEETS_PER_RUN) {
      var deals = scanDeals(assets);
      stats.dealsFound = deals.length;

      // Filter to tweetable deals
      var tweetableDeals = [];
      for (var di = 0; di < deals.length; di++) {
        var deal = deals[di];
        if (deal.type === "funding_harvest" && deal.score >= DEAL_MIN_SCORE && Math.abs(deal.fundingAPR) >= DEAL_MIN_APR) {
          tweetableDeals.push(deal);
        }
      }
      stats.dealsQualified = tweetableDeals.length;

      // Cap at 3 per cron run to avoid spam
      var maxDeals = Math.min(3, tweetableDeals.length);
      for (var dk = 0; dk < maxDeals; dk++) {
        var dDeal = tweetableDeals[dk];

        if (isInCooldown(dDeal.sym, "deal")) {
          skipped.push({ sym: dDeal.sym, reason: "cooldown_deal", type: "deal" });
          continue;
        }

        try {
          var dResult = await processDealTweet(dDeal);
          if (dResult.posted) {
            posted.push({ sym: dDeal.sym, apr: (Math.abs(dDeal.fundingAPR) * 100).toFixed(0) + "%", type: "deal", tweetId: dResult.tweetId });
          } else {
            skipped.push({ sym: dDeal.sym, reason: dResult.reason, type: "deal" });
          }
        } catch (err: any) {
          errors.push("deal:" + dDeal.sym + ": " + (err?.message || "unknown"));
        }
      }
    }
  } catch (err: any) {
    errors.push("Fetch failed: " + (err?.message || "unknown error"));
  }

  var elapsed = Date.now() - startTime;

  return NextResponse.json({
    ok: true,
    elapsed: elapsed + "ms",
    scanned: scanned,
    posted: posted,
    skipped: skipped,
    errors: errors,
    stats: stats,
    tweetConfig: tc,
  });
}
