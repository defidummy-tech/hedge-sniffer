// ═══ Cron endpoint: scan for high funding rates and tweet alerts ═══

import { NextResponse } from "next/server";
import { fetchAssetsForCron } from "../../../services/serverDataFetcher";
import { isInCooldown, formatTweet, processDealAlert } from "../../../services/twitterClient";
import { PRIORITY_MAPPINGS } from "../../../services/marketMapping";

// APR thresholds (configurable via env vars)
var EXTREME_APR = parseFloat(process.env.TWEET_THRESHOLD_EXTREME_APR || "5.0");   // 500%
var HIGH_APR = parseFloat(process.env.TWEET_THRESHOLD_HIGH_APR || "1.0");          // 100%

// Known asset syms from priority mappings (for HIGH tier — only tweet known assets)
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
  var qualified = 0;
  var posted: Array<{ sym: string; apr: string; tweetId?: string }> = [];
  var skipped: Array<{ sym: string; reason: string }> = [];
  var errors: string[] = [];

  try {
    // 1. Fetch all assets from Hyperliquid
    var assets = await fetchAssetsForCron();
    scanned = assets.length;

    // 2. Filter for high funding rate opportunities
    for (var i = 0; i < assets.length; i++) {
      var asset = assets[i];
      var absAPR = Math.abs(asset.fundingRateAPR || 0);

      // Check if this qualifies for tweeting
      var qualifies = false;
      if (absAPR >= EXTREME_APR) {
        // Extreme: any asset
        qualifies = true;
      } else if (absAPR >= HIGH_APR && KNOWN_SYMS.has(asset.sym)) {
        // High: only known/priority assets
        qualifies = true;
      }

      if (!qualifies) continue;
      qualified++;

      // Check cooldown before posting
      if (isInCooldown(asset.sym)) {
        skipped.push({ sym: asset.sym, reason: "cooldown" });
        continue;
      }

      // 3. Process and post
      try {
        var result = await processDealAlert(asset);
        if (result.posted) {
          posted.push({
            sym: asset.sym,
            apr: (absAPR * 100).toFixed(0) + "%",
            tweetId: result.tweetId,
          });
        } else {
          skipped.push({ sym: asset.sym, reason: result.reason });
        }
      } catch (err: any) {
        errors.push(asset.sym + ": " + (err?.message || "unknown error"));
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
    qualified: qualified,
    posted: posted,
    skipped: skipped,
    errors: errors,
    thresholds: { extreme: EXTREME_APR, high: HIGH_APR },
  });
}
