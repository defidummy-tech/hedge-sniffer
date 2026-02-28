// Hyperliquid Funding Rate Backtesting Script
// Analyzes extreme funding rate episodes (>1000% APR) and mean reversion behavior

const API_URL = "https://api.hyperliquid.xyz/info";

// Constants
const HOURS_PER_YEAR = 8760;
const EXTREME_APR_THRESHOLD = 10.0; // 1000% = 10.0 in decimal
const REVERT_APR_THRESHOLD = 1.0;   // 100% = 1.0 in decimal
const EXTREME_HOURLY_RATE = EXTREME_APR_THRESHOLD / HOURS_PER_YEAR; // ~0.001142
const REVERT_HOURLY_RATE = REVERT_APR_THRESHOLD / HOURS_PER_YEAR;   // ~0.000114
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const LOOKBACK_WINDOWS = [1, 4, 12, 24, 48, 168]; // hours after spike start

// Ventuals tokens to always include (need full coin name from HL universe)
const VENTUALS_TOKENS_RAW = ["OPENAI", "SPACEX", "ANTHROPIC"];

async function apiCall(body) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Step 1: Get all perps and find top 20 by absolute funding rate
async function getTopFundingTokens() {
  console.log("=== Step 1: Fetching all perpetual markets ===\n");
  const data = await apiCall({ type: "metaAndAssetCtxs" });
  const [meta, contexts] = data;

  const tokens = meta.universe.map((asset, i) => ({
    name: asset.name,
    fundingRate: parseFloat(contexts[i].funding),
    apr: parseFloat(contexts[i].funding) * HOURS_PER_YEAR,
    aprPercent: parseFloat(contexts[i].funding) * HOURS_PER_YEAR * 100,
  }));

  // Sort by absolute funding rate
  tokens.sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate));

  console.log(`Total perps found: ${tokens.length}\n`);
  console.log("Top 20 by absolute funding rate:");
  console.log("-".repeat(60));
  console.log(
    "Rank".padEnd(6) +
      "Token".padEnd(20) +
      "Hourly Rate".padEnd(16) +
      "APR %"
  );
  console.log("-".repeat(60));

  const top20 = tokens.slice(0, 20);
  top20.forEach((t, i) => {
    console.log(
      `${(i + 1).toString().padEnd(6)}${t.name.padEnd(20)}${t.fundingRate.toFixed(8).padEnd(16)}${t.aprPercent.toFixed(1)}%`
    );
  });

  const extremeCount = tokens.filter(
    (t) => Math.abs(t.fundingRate) > EXTREME_HOURLY_RATE
  ).length;
  console.log(
    `\nTokens currently above 1000% APR: ${extremeCount}`
  );

  return { top20, allTokens: tokens };
}

// Step 2: Fetch 30-day funding history for a token (with pagination)
async function fetchFundingHistory(coin) {
  const thirtyDaysAgo = Date.now() - THIRTY_DAYS_MS;
  let allData = [];
  let startTime = thirtyDaysAgo;

  try {
    // Paginate: the API returns max 500 entries per call
    while (true) {
      const data = await apiCall({
        type: "fundingHistory",
        coin: coin,
        startTime: startTime,
      });
      if (!data || data.length === 0) break;

      allData = allData.concat(data);

      // If we got fewer than 500, we've reached the end
      if (data.length < 500) break;

      // Move startTime past the last entry
      const lastTime = data[data.length - 1].time;
      startTime = lastTime + 1;

      await sleep(100); // Rate limit between pagination calls
    }

    // Deduplicate by time
    const seen = new Set();
    allData = allData.filter((entry) => {
      const key = `${entry.time}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return allData;
  } catch (e) {
    console.log(`  Warning: Could not fetch history for ${coin}: ${e.message}`);
    return [];
  }
}

// Step 3: Identify extreme episodes in funding history
function identifyExtremeEpisodes(history, coin) {
  if (!history || history.length === 0) return [];

  // Sort by time
  history.sort((a, b) => a.time - b.time);

  const episodes = [];
  let currentEpisode = null;

  for (let i = 0; i < history.length; i++) {
    const entry = history[i];
    const rate = parseFloat(entry.fundingRate);
    const absRate = Math.abs(rate);
    const isExtreme = absRate > EXTREME_HOURLY_RATE;

    if (isExtreme && !currentEpisode) {
      // Start of a new episode
      currentEpisode = {
        coin: coin,
        startTime: entry.time,
        startIndex: i,
        peakRate: absRate,
        peakApr: absRate * HOURS_PER_YEAR * 100,
        direction: rate > 0 ? "long-pays" : "short-pays",
        entries: [{ time: entry.time, rate: rate, absRate: absRate }],
      };
    } else if (isExtreme && currentEpisode) {
      // Continuing an extreme episode
      currentEpisode.entries.push({
        time: entry.time,
        rate: rate,
        absRate: absRate,
      });
      if (absRate > currentEpisode.peakRate) {
        currentEpisode.peakRate = absRate;
        currentEpisode.peakApr = absRate * HOURS_PER_YEAR * 100;
      }
    } else if (!isExtreme && currentEpisode) {
      // End of episode
      currentEpisode.endTime = entry.time;
      currentEpisode.durationHours =
        (entry.time - currentEpisode.startTime) / (1000 * 60 * 60);
      episodes.push(currentEpisode);
      currentEpisode = null;
    }
  }

  // If still in an episode at end of data
  if (currentEpisode) {
    const lastEntry = history[history.length - 1];
    currentEpisode.endTime = lastEntry.time;
    currentEpisode.durationHours =
      (lastEntry.time - currentEpisode.startTime) / (1000 * 60 * 60);
    currentEpisode.stillActive = true;
    episodes.push(currentEpisode);
  }

  return episodes;
}

// Step 4: Analyze what happens after each episode starts
function analyzePostSpike(history, episode) {
  if (!history || history.length === 0) return null;

  // Build a time-indexed lookup of the full history
  const sorted = [...history].sort((a, b) => a.time - b.time);

  const result = {
    coin: episode.coin,
    startTime: new Date(episode.startTime).toISOString(),
    peakApr: episode.peakApr,
    direction: episode.direction,
    durationHours: episode.durationHours,
    stillActive: episode.stillActive || false,
    afterSpike: {},
    revertedBelow100: false,
    revertTimeHours: null,
    cumulativeEarnings: 0, // sum of funding rates during & after spike
  };

  // For each lookback window, find the funding rate at that time after spike start
  for (const hours of LOOKBACK_WINDOWS) {
    const targetTime = episode.startTime + hours * 60 * 60 * 1000;
    // Find the closest entry to the target time
    let closest = null;
    let closestDiff = Infinity;

    for (const entry of sorted) {
      const diff = Math.abs(entry.time - targetTime);
      if (diff < closestDiff) {
        closestDiff = diff;
        closest = entry;
      }
    }

    if (closest && closestDiff < 2 * 60 * 60 * 1000) {
      // within 2 hours
      const rate = parseFloat(closest.fundingRate);
      result.afterSpike[`${hours}h`] = {
        apr: (Math.abs(rate) * HOURS_PER_YEAR * 100).toFixed(1) + "%",
        rawRate: rate,
      };
    } else {
      result.afterSpike[`${hours}h`] = { apr: "N/A", rawRate: null };
    }
  }

  // Check if it reverted below 100% APR within 7 days
  const sevenDaysAfter = episode.startTime + 7 * 24 * 60 * 60 * 1000;
  for (const entry of sorted) {
    if (entry.time > episode.startTime && entry.time <= sevenDaysAfter) {
      const absRate = Math.abs(parseFloat(entry.fundingRate));
      if (absRate < REVERT_HOURLY_RATE) {
        result.revertedBelow100 = true;
        result.revertTimeHours =
          (entry.time - episode.startTime) / (1000 * 60 * 60);
        break;
      }
    }
  }

  // Calculate cumulative earnings if you entered at spike start
  // Sum hourly funding for 7 days (or until data ends)
  let cumulativeRate = 0;
  let hoursCollected = 0;
  for (const entry of sorted) {
    if (
      entry.time >= episode.startTime &&
      entry.time <= episode.startTime + 7 * 24 * 60 * 60 * 1000
    ) {
      cumulativeRate += Math.abs(parseFloat(entry.fundingRate));
      hoursCollected++;
    }
  }
  result.cumulativeEarnings = cumulativeRate;
  result.cumulativeEarningsPercent = (cumulativeRate * 100).toFixed(4) + "%";
  result.hoursCollected = hoursCollected;

  return result;
}

// Main execution
async function main() {
  console.log("=".repeat(80));
  console.log(
    "HYPERLIQUID FUNDING RATE BACKTESTING ANALYSIS"
  );
  console.log(
    "Analyzing extreme funding rate episodes (>1000% APR) and mean reversion"
  );
  console.log("=".repeat(80));
  console.log();

  // Step 1: Get top tokens
  const { top20, allTokens } = await getTopFundingTokens();

  // Build the list of tokens to analyze
  const tokensToAnalyze = new Set(top20.map((t) => t.name));

  // Add Ventuals tokens - look for them in the universe by partial match
  const allCoinNames = allTokens.map((t) => t.name);
  for (const v of VENTUALS_TOKENS_RAW) {
    // Try exact match first, then partial match
    const exact = allCoinNames.find((n) => n === v);
    const partial = allCoinNames.find(
      (n) => n.toUpperCase().includes(v.toUpperCase())
    );
    if (exact) {
      tokensToAnalyze.add(exact);
      console.log(`  Found Ventuals token: ${exact}`);
    } else if (partial) {
      tokensToAnalyze.add(partial);
      console.log(`  Found Ventuals token: ${partial} (matched from ${v})`);
    } else {
      console.log(`  Warning: Ventuals token ${v} not found in HL universe`);
    }
  }

  console.log(
    `\n=== Step 2: Fetching 30-day funding history for ${tokensToAnalyze.size} tokens ===\n`
  );

  const allHistories = {};
  const allEpisodes = [];
  const allAnalyses = [];

  let idx = 0;
  for (const coin of tokensToAnalyze) {
    idx++;
    process.stdout.write(
      `  [${idx}/${tokensToAnalyze.size}] Fetching ${coin}...`
    );
    const history = await fetchFundingHistory(coin);
    allHistories[coin] = history;
    console.log(` ${history.length} data points`);

    // Rate limit - small delay between requests
    if (idx < tokensToAnalyze.size) {
      await sleep(200);
    }
  }

  console.log(
    `\n=== Step 3: Identifying extreme funding episodes (>1000% APR) ===\n`
  );

  for (const coin of tokensToAnalyze) {
    const history = allHistories[coin];
    if (!history || history.length === 0) continue;

    const episodes = identifyExtremeEpisodes(history, coin);
    if (episodes.length > 0) {
      console.log(
        `  ${coin}: ${episodes.length} extreme episode(s) found`
      );
      for (const ep of episodes) {
        allEpisodes.push(ep);
        const analysis = analyzePostSpike(history, ep);
        if (analysis) allAnalyses.push(analysis);
      }
    }
  }

  console.log(`\nTotal extreme episodes found: ${allEpisodes.length}`);

  // Step 4: Print detailed results
  console.log(
    `\n${"=".repeat(80)}`
  );
  console.log("DETAILED EPISODE ANALYSIS");
  console.log("=".repeat(80));

  for (const a of allAnalyses) {
    console.log(`\n--- ${a.coin} ---`);
    console.log(`  Start:     ${a.startTime}`);
    console.log(`  Peak APR:  ${a.peakApr.toFixed(1)}%`);
    console.log(`  Direction: ${a.direction}`);
    console.log(
      `  Duration above 1000%: ${a.durationHours.toFixed(1)} hours${a.stillActive ? " (STILL ACTIVE)" : ""}`
    );
    console.log(`  Post-spike APR:`);
    for (const [window, data] of Object.entries(a.afterSpike)) {
      console.log(`    After ${window.padEnd(5)}: ${data.apr}`);
    }
    console.log(
      `  Reverted below 100%: ${a.revertedBelow100 ? `Yes, after ${a.revertTimeHours.toFixed(1)} hours` : "No (within 7 days)"}`
    );
    console.log(
      `  Cumulative funding earned (7d): ${a.cumulativeEarningsPercent} over ${a.hoursCollected} hours`
    );
  }

  // Step 5: Summary statistics
  console.log(`\n${"=".repeat(80)}`);
  console.log("SUMMARY STATISTICS");
  console.log("=".repeat(80));

  if (allAnalyses.length === 0) {
    console.log("\nNo extreme episodes found in the analyzed period.");
    console.log(
      "This could mean funding rates have been relatively calm in the last 30 days."
    );

    // Still show some interesting data - tokens with highest historical rates
    console.log("\n--- Highest Funding Rates in Last 30 Days ---");
    for (const coin of tokensToAnalyze) {
      const history = allHistories[coin];
      if (!history || history.length === 0) continue;

      let maxRate = 0;
      let maxTime = 0;
      for (const entry of history) {
        const absRate = Math.abs(parseFloat(entry.fundingRate));
        if (absRate > maxRate) {
          maxRate = absRate;
          maxTime = entry.time;
        }
      }
      if (maxRate > 0) {
        const apr = (maxRate * HOURS_PER_YEAR * 100).toFixed(1);
        console.log(
          `  ${coin.padEnd(20)} Peak APR: ${apr.padStart(10)}%  at ${new Date(maxTime).toISOString()}`
        );
      }
    }

    // Lower threshold analysis
    console.log(
      "\n--- Relaxed Threshold Analysis (>500% APR) ---"
    );
    const RELAXED_THRESHOLD = 5.0 / HOURS_PER_YEAR; // 500% APR

    let relaxedEpisodes = [];
    for (const coin of tokensToAnalyze) {
      const history = allHistories[coin];
      if (!history || history.length === 0) continue;

      const sorted = [...history].sort((a, b) => a.time - b.time);
      let inEpisode = false;
      let ep = null;

      for (let i = 0; i < sorted.length; i++) {
        const rate = Math.abs(parseFloat(sorted[i].fundingRate));
        if (rate > RELAXED_THRESHOLD && !inEpisode) {
          inEpisode = true;
          ep = {
            coin,
            startTime: sorted[i].time,
            peakRate: rate,
            peakApr: rate * HOURS_PER_YEAR * 100,
          };
        } else if (rate > RELAXED_THRESHOLD && inEpisode) {
          if (rate > ep.peakRate) {
            ep.peakRate = rate;
            ep.peakApr = rate * HOURS_PER_YEAR * 100;
          }
        } else if (rate <= RELAXED_THRESHOLD && inEpisode) {
          ep.endTime = sorted[i].time;
          ep.durationHours =
            (sorted[i].time - ep.startTime) / (1000 * 60 * 60);
          relaxedEpisodes.push(ep);
          inEpisode = false;
          ep = null;
        }
      }
      if (inEpisode && ep) {
        ep.endTime = sorted[sorted.length - 1].time;
        ep.durationHours =
          (ep.endTime - ep.startTime) / (1000 * 60 * 60);
        ep.stillActive = true;
        relaxedEpisodes.push(ep);
      }
    }

    if (relaxedEpisodes.length > 0) {
      console.log(
        `Found ${relaxedEpisodes.length} episodes above 500% APR:\n`
      );
      for (const ep of relaxedEpisodes) {
        console.log(
          `  ${ep.coin.padEnd(20)} Peak: ${ep.peakApr.toFixed(1)}% APR  Duration: ${ep.durationHours.toFixed(1)}h  ${ep.stillActive ? "(ACTIVE)" : ""}`
        );
      }
    } else {
      console.log("No episodes above 500% APR found either.");
    }

    // Even more relaxed - 200% APR
    console.log(
      "\n--- Further Relaxed Threshold Analysis (>200% APR) ---"
    );
    const VERY_RELAXED = 2.0 / HOURS_PER_YEAR;

    let veryRelaxedEpisodes = [];
    for (const coin of tokensToAnalyze) {
      const history = allHistories[coin];
      if (!history || history.length === 0) continue;

      const sorted = [...history].sort((a, b) => a.time - b.time);
      let inEpisode = false;
      let ep = null;

      for (let i = 0; i < sorted.length; i++) {
        const rate = Math.abs(parseFloat(sorted[i].fundingRate));
        if (rate > VERY_RELAXED && !inEpisode) {
          inEpisode = true;
          ep = {
            coin,
            startTime: sorted[i].time,
            peakRate: rate,
            peakApr: rate * HOURS_PER_YEAR * 100,
          };
        } else if (rate > VERY_RELAXED && inEpisode) {
          if (rate > ep.peakRate) {
            ep.peakRate = rate;
            ep.peakApr = rate * HOURS_PER_YEAR * 100;
          }
        } else if (rate <= VERY_RELAXED && inEpisode) {
          ep.endTime = sorted[i].time;
          ep.durationHours =
            (sorted[i].time - ep.startTime) / (1000 * 60 * 60);
          veryRelaxedEpisodes.push(ep);
          inEpisode = false;
          ep = null;
        }
      }
      if (inEpisode && ep) {
        ep.endTime = sorted[sorted.length - 1].time;
        ep.durationHours =
          (ep.endTime - ep.startTime) / (1000 * 60 * 60);
        ep.stillActive = true;
        veryRelaxedEpisodes.push(ep);
      }
    }

    if (veryRelaxedEpisodes.length > 0) {
      console.log(
        `Found ${veryRelaxedEpisodes.length} episodes above 200% APR:\n`
      );
      // Group by coin
      const byCoin = {};
      for (const ep of veryRelaxedEpisodes) {
        if (!byCoin[ep.coin]) byCoin[ep.coin] = [];
        byCoin[ep.coin].push(ep);
      }
      for (const [coin, eps] of Object.entries(byCoin)) {
        console.log(`  ${coin}: ${eps.length} episode(s)`);
        for (const ep of eps.slice(0, 5)) {
          console.log(
            `    Peak: ${ep.peakApr.toFixed(1)}% APR  Duration: ${ep.durationHours.toFixed(1)}h  Start: ${new Date(ep.startTime).toISOString().slice(0, 16)}  ${ep.stillActive ? "(ACTIVE)" : ""}`
          );
        }
        if (eps.length > 5) console.log(`    ... and ${eps.length - 5} more`);
      }
    }

    return;
  }

  // We have episodes - compute stats
  const durations = allAnalyses.map((a) => a.durationHours);
  const reverted = allAnalyses.filter((a) => a.revertedBelow100);
  const revertTimes = reverted.map((a) => a.revertTimeHours);
  const earnings = allAnalyses.map((a) => a.cumulativeEarnings);

  const avg = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const median = (arr) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  console.log(`\nTotal extreme episodes (>1000% APR): ${allAnalyses.length}`);
  console.log(
    `Unique tokens with extreme episodes: ${new Set(allAnalyses.map((a) => a.coin)).size}`
  );

  console.log(`\n--- Duration of >1000% APR Episodes ---`);
  console.log(`  Average:  ${avg(durations).toFixed(1)} hours`);
  console.log(`  Median:   ${median(durations).toFixed(1)} hours`);
  console.log(
    `  Min:      ${Math.min(...durations).toFixed(1)} hours`
  );
  console.log(
    `  Max:      ${Math.max(...durations).toFixed(1)} hours`
  );

  console.log(`\n--- Mean Reversion to <100% APR ---`);
  console.log(
    `  Episodes that reverted below 100%: ${reverted.length}/${allAnalyses.length} (${((reverted.length / allAnalyses.length) * 100).toFixed(1)}%)`
  );
  if (revertTimes.length > 0) {
    console.log(
      `  Average revert time:  ${avg(revertTimes).toFixed(1)} hours`
    );
    console.log(
      `  Median revert time:   ${median(revertTimes).toFixed(1)} hours`
    );
  }

  const stillActive = allAnalyses.filter((a) => a.stillActive).length;
  console.log(
    `  Still active (elevated): ${stillActive}/${allAnalyses.length}`
  );

  console.log(`\n--- Cumulative Funding Earnings (7d after spike) ---`);
  console.log(
    `  Average:  ${(avg(earnings) * 100).toFixed(4)}% of position`
  );
  console.log(
    `  Median:   ${(median(earnings) * 100).toFixed(4)}% of position`
  );

  // APR decay analysis
  console.log(`\n--- Average APR Decay After Spike Start ---`);
  for (const window of LOOKBACK_WINDOWS) {
    const key = `${window}h`;
    const rates = allAnalyses
      .map((a) => a.afterSpike[key]?.rawRate)
      .filter((r) => r !== null && r !== undefined);
    if (rates.length > 0) {
      const avgApr = avg(rates.map((r) => Math.abs(r))) * HOURS_PER_YEAR * 100;
      console.log(
        `  After ${key.padEnd(5)}: ${avgApr.toFixed(1)}% APR (avg of ${rates.length} episodes)`
      );
    }
  }

  // Direction breakdown
  const longPays = allAnalyses.filter(
    (a) => a.direction === "long-pays"
  ).length;
  const shortPays = allAnalyses.filter(
    (a) => a.direction === "short-pays"
  ).length;
  console.log(`\n--- Direction Breakdown ---`);
  console.log(
    `  Long pays short (positive funding): ${longPays} (${((longPays / allAnalyses.length) * 100).toFixed(1)}%)`
  );
  console.log(
    `  Short pays long (negative funding): ${shortPays} (${((shortPays / allAnalyses.length) * 100).toFixed(1)}%)`
  );

  // Per-token summary
  console.log(`\n--- Per-Token Episode Summary ---`);
  const byCoin = {};
  for (const a of allAnalyses) {
    if (!byCoin[a.coin]) byCoin[a.coin] = [];
    byCoin[a.coin].push(a);
  }

  console.log(
    "Token".padEnd(20) +
      "Episodes".padEnd(10) +
      "Avg Peak APR".padEnd(15) +
      "Avg Duration".padEnd(14) +
      "Revert %"
  );
  console.log("-".repeat(70));
  for (const [coin, analyses] of Object.entries(byCoin)) {
    const avgPeak = avg(analyses.map((a) => a.peakApr));
    const avgDur = avg(analyses.map((a) => a.durationHours));
    const revertPct =
      (analyses.filter((a) => a.revertedBelow100).length / analyses.length) *
      100;
    console.log(
      `${coin.padEnd(20)}${analyses.length.toString().padEnd(10)}${(avgPeak.toFixed(1) + "%").padEnd(15)}${(avgDur.toFixed(1) + "h").padEnd(14)}${revertPct.toFixed(0)}%`
    );
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log("CONCLUSION");
  console.log("=".repeat(80));

  if (allAnalyses.length > 0) {
    const revertPct = (reverted.length / allAnalyses.length) * 100;
    const avgRevert =
      revertTimes.length > 0 ? avg(revertTimes).toFixed(1) : "N/A";
    const avgDur = avg(durations).toFixed(1);

    console.log(`\nBased on ${allAnalyses.length} extreme funding episodes in the last 30 days:`);
    console.log(
      `- ${revertPct.toFixed(0)}% of >1000% APR episodes reverted below 100% APR within 7 days`
    );
    console.log(
      `- Average duration above 1000% APR: ${avgDur} hours`
    );
    if (revertTimes.length > 0) {
      console.log(
        `- Average time to revert below 100%: ${avgRevert} hours`
      );
    }
    console.log(
      `- Average 7-day cumulative funding: ${(avg(earnings) * 100).toFixed(4)}% of position`
    );

    if (revertPct > 70) {
      console.log(
        `\nSTRONG MEAN REVERSION: Most extreme funding episodes revert relatively quickly.`
      );
      console.log(
        `This suggests that entering funding rate arbitrage positions during spikes may be profitable.`
      );
    } else if (revertPct > 40) {
      console.log(
        `\nMODERATE MEAN REVERSION: Roughly half of extreme episodes revert.`
      );
      console.log(
        `Funding rate arbitrage has mixed results - careful position sizing needed.`
      );
    } else {
      console.log(
        `\nWEAK MEAN REVERSION: Many extreme episodes persist or stay elevated.`
      );
      console.log(
        `High funding rates on these tokens may reflect structural demand rather than temporary imbalance.`
      );
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
