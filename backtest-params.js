// ═══ Parameter Optimization Backtest ═══
// Simulates the funding rate strategy with different parameter combinations
// against 30 days of real Hyperliquid data (funding + price candles).
//
// Usage: node backtest-params.js [--coins N] [--days N]

const API_URL = "https://api.hyperliquid.xyz/info";
const HOURS_PER_YEAR = 8760;
const ONE_HOUR_MS = 3600000;

// ── Parameter grid to test ──
const PARAM_GRID = {
  entryAPR:       [0.5, 1.0, 2.0, 5.0, 10.0, 18.0],   // minimum abs APR to enter
  stopLossPct:    [3, 5, 7],                             // % stop loss from entry
  trailingStopPct:[0, 5, 10],                            // 0 = disabled
  exitAPR:        [0.1, 0.5, 1.0],                       // exit when funding drops below this
};

const LEVERAGE = 3;
const POSITION_USD = 100;
const MAX_HOLD_HOURS = 168;

// ── CLI args ──
const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf("--" + name);
  return idx >= 0 && args[idx + 1] ? parseInt(args[idx + 1]) : fallback;
}
const NUM_COINS = getArg("coins", 40);
const LOOKBACK_DAYS = getArg("days", 30);

async function apiCall(body) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Data fetching ──

async function fetchFundingHistory(coin) {
  const startTime = Date.now() - LOOKBACK_DAYS * 24 * ONE_HOUR_MS;
  let allData = [];
  let cursor = startTime;

  while (true) {
    const data = await apiCall({ type: "fundingHistory", coin, startTime: cursor });
    if (!data || data.length === 0) break;
    allData = allData.concat(data);
    if (data.length < 500) break;
    cursor = data[data.length - 1].time + 1;
    await sleep(50);
  }

  const seen = new Set();
  return allData.filter((e) => {
    if (seen.has(e.time)) return false;
    seen.add(e.time);
    return true;
  }).sort((a, b) => a.time - b.time);
}

async function fetchCandles(coin) {
  const startTime = Date.now() - LOOKBACK_DAYS * 24 * ONE_HOUR_MS;
  try {
    const data = await apiCall({
      type: "candleSnapshot",
      req: { coin, interval: "1h", startTime, endTime: Date.now() },
    });
    return (Array.isArray(data) ? data : []).sort((a, b) => a.t - b.t);
  } catch (e) {
    return [];
  }
}

function findPrice(candles, targetTime) {
  if (!candles || candles.length === 0) return null;
  let lo = 0, hi = candles.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].t < targetTime) lo = mid + 1;
    else hi = mid;
  }
  // Check lo and lo-1 for closest
  let best = candles[lo];
  if (lo > 0 && Math.abs(candles[lo - 1].t - targetTime) < Math.abs(best.t - targetTime)) {
    best = candles[lo - 1];
  }
  if (Math.abs(best.t - targetTime) > 2 * ONE_HOUR_MS) return null;
  return parseFloat(best.c);
}

// ── Trade simulation ──

function simulateTrades(funding, candles, params) {
  if (!funding.length || !candles.length) return [];

  const trades = [];
  let openTrade = null;
  let peakPrice = null;

  for (let i = 0; i < funding.length; i++) {
    const entry = funding[i];
    const time = entry.time;
    const rate = parseFloat(entry.fundingRate);
    const apr = rate * HOURS_PER_YEAR;
    const absAPR = Math.abs(apr);
    const price = findPrice(candles, time);
    if (price === null) continue;

    // ── Check open trade exits ──
    if (openTrade) {
      const holdHours = (time - openTrade.entryTime) / ONE_HOUR_MS;
      const notional = POSITION_USD * LEVERAGE;
      const priceChange = (price - openTrade.entryPrice) / openTrade.entryPrice;
      const pricePnl = openTrade.direction === "long" ? notional * priceChange : notional * -priceChange;

      // Accumulate funding earned this hour
      const fundingFavorsUs = (openTrade.direction === "short" && rate > 0) ||
                               (openTrade.direction === "long" && rate < 0);
      if (fundingFavorsUs) {
        openTrade.fundingEarned += Math.abs(rate) * notional;
      } else {
        openTrade.fundingEarned -= Math.abs(rate) * notional;
      }

      // Update peak price for trailing stop
      if (openTrade.direction === "long") {
        if (price > peakPrice) peakPrice = price;
      } else {
        if (price < peakPrice) peakPrice = price;
      }

      let exitReason = null;

      // Stop loss check
      if (openTrade.direction === "long" && price <= openTrade.stopPrice) {
        exitReason = "stop_loss";
      } else if (openTrade.direction === "short" && price >= openTrade.stopPrice) {
        exitReason = "stop_loss";
      }

      // Trailing stop: ratchet stop once profit exceeds activation
      if (!exitReason && params.trailingStopPct > 0) {
        const profitPct = (pricePnl / POSITION_USD) * 100;
        if (profitPct >= params.trailingStopPct) {
          const origStopDist = Math.abs(openTrade.entryPrice - openTrade.origStop);
          let newStop;
          if (openTrade.direction === "long") {
            newStop = peakPrice - origStopDist;
            if (newStop > openTrade.stopPrice) openTrade.stopPrice = newStop;
          } else {
            newStop = peakPrice + origStopDist;
            if (newStop < openTrade.stopPrice) openTrade.stopPrice = newStop;
          }
        }
      }

      // Funding flipped — exit when funding no longer favors us
      if (!exitReason && !fundingFavorsUs && absAPR < params.exitAPR) {
        exitReason = "funding_flipped";
      }

      // Max hold
      if (!exitReason && holdHours >= MAX_HOLD_HOURS) {
        exitReason = "max_hold";
      }

      if (exitReason) {
        openTrade.exitPrice = price;
        openTrade.exitTime = time;
        openTrade.exitReason = exitReason;
        openTrade.pricePnl = pricePnl;
        openTrade.totalReturn = pricePnl + openTrade.fundingEarned;
        openTrade.holdHours = holdHours;
        trades.push({ ...openTrade });
        openTrade = null;
        peakPrice = null;
        continue; // Don't enter same hour we exit
      }
    }

    // ── Check entry ──
    if (!openTrade && absAPR >= params.entryAPR) {
      const direction = rate > 0 ? "short" : "long";
      const stopDist = price * (params.stopLossPct / 100);
      const stopPrice = direction === "long" ? price - stopDist : price + stopDist;

      openTrade = {
        coin: funding[0].coin || "?",
        direction,
        entryPrice: price,
        entryTime: time,
        entryAPR: apr,
        stopPrice,
        origStop: stopPrice,
        fundingEarned: 0,
        pricePnl: 0,
        totalReturn: 0,
        exitPrice: null,
        exitTime: null,
        exitReason: null,
        holdHours: 0,
      };
      peakPrice = price;
    }
  }

  // Close any remaining open trade at last known price
  if (openTrade) {
    const lastFunding = funding[funding.length - 1];
    const lastPrice = findPrice(candles, lastFunding.time);
    if (lastPrice !== null) {
      const holdHours = (lastFunding.time - openTrade.entryTime) / ONE_HOUR_MS;
      const notional = POSITION_USD * LEVERAGE;
      const priceChange = (lastPrice - openTrade.entryPrice) / openTrade.entryPrice;
      const pricePnl = openTrade.direction === "long" ? notional * priceChange : notional * -priceChange;
      openTrade.exitPrice = lastPrice;
      openTrade.exitTime = lastFunding.time;
      openTrade.exitReason = "still_open";
      openTrade.pricePnl = pricePnl;
      openTrade.totalReturn = pricePnl + openTrade.fundingEarned;
      openTrade.holdHours = holdHours;
      trades.push({ ...openTrade });
    }
  }

  return trades;
}

// ── Main ──

async function main() {
  console.log("=".repeat(80));
  console.log("PARAMETER OPTIMIZATION BACKTEST");
  console.log(`Lookback: ${LOOKBACK_DAYS} days | Coins: top ${NUM_COINS} | Leverage: ${LEVERAGE}x | Size: $${POSITION_USD}`);
  console.log("=".repeat(80));

  // 1. Get top coins by absolute funding rate
  console.log("\nFetching market data...");
  const data = await apiCall({ type: "metaAndAssetCtxs" });
  const [meta, ctxs] = data;

  const tokens = meta.universe.map((u, i) => ({
    name: u.name,
    absAPR: Math.abs(parseFloat(ctxs[i].funding)) * HOURS_PER_YEAR,
  }));
  tokens.sort((a, b) => b.absAPR - a.absAPR);
  const topCoins = tokens.slice(0, NUM_COINS).map((t) => t.name);

  console.log(`Top ${topCoins.length} coins: ${topCoins.slice(0, 10).join(", ")}...`);

  // 2. Fetch funding + candle data for all coins
  console.log(`\nFetching ${LOOKBACK_DAYS}-day history for ${topCoins.length} coins...`);

  const coinData = {};
  for (let i = 0; i < topCoins.length; i++) {
    const coin = topCoins[i];
    process.stdout.write(`  [${i + 1}/${topCoins.length}] ${coin}...`);

    const [funding, candles] = await Promise.all([
      fetchFundingHistory(coin),
      fetchCandles(coin),
    ]);

    // Tag funding entries with coin name
    for (const f of funding) f.coin = coin;

    coinData[coin] = { funding, candles };
    console.log(` ${funding.length} funding, ${candles.length} candles`);

    if (i < topCoins.length - 1) await sleep(100);
  }

  // 3. Run parameter grid
  console.log("\n" + "=".repeat(80));
  console.log("RUNNING PARAMETER GRID...");
  console.log("=".repeat(80));

  const results = [];

  for (const entryAPR of PARAM_GRID.entryAPR) {
    for (const stopLossPct of PARAM_GRID.stopLossPct) {
      for (const trailingStopPct of PARAM_GRID.trailingStopPct) {
        for (const exitAPR of PARAM_GRID.exitAPR) {
          const params = { entryAPR, stopLossPct, trailingStopPct, exitAPR };

          let allTrades = [];
          for (const coin of topCoins) {
            const { funding, candles } = coinData[coin];
            const trades = simulateTrades(funding, candles, params);
            allTrades = allTrades.concat(trades);
          }

          if (allTrades.length === 0) {
            results.push({ ...params, trades: 0, totalPnL: 0, winRate: 0, avgWin: 0, avgLoss: 0, sharpe: 0, maxDD: 0 });
            continue;
          }

          // Stats
          const winners = allTrades.filter((t) => t.totalReturn > 0);
          const losers = allTrades.filter((t) => t.totalReturn <= 0);
          const totalPnL = allTrades.reduce((s, t) => s + t.totalReturn, 0);
          const winRate = allTrades.length > 0 ? (winners.length / allTrades.length) * 100 : 0;
          const avgWin = winners.length > 0 ? winners.reduce((s, t) => s + t.totalReturn, 0) / winners.length : 0;
          const avgLoss = losers.length > 0 ? losers.reduce((s, t) => s + t.totalReturn, 0) / losers.length : 0;

          // Sharpe-like ratio (mean return / std dev of returns)
          const returns = allTrades.map((t) => t.totalReturn);
          const mean = totalPnL / allTrades.length;
          const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
          const sharpe = variance > 0 ? mean / Math.sqrt(variance) : 0;

          // Max drawdown (cumulative PnL curve)
          let peak = 0, maxDD = 0, cumPnL = 0;
          for (const t of allTrades.sort((a, b) => a.entryTime - b.entryTime)) {
            cumPnL += t.totalReturn;
            if (cumPnL > peak) peak = cumPnL;
            const dd = peak - cumPnL;
            if (dd > maxDD) maxDD = dd;
          }

          // Total funding earned
          const totalFunding = allTrades.reduce((s, t) => s + t.fundingEarned, 0);
          const totalPricePnl = allTrades.reduce((s, t) => s + t.pricePnl, 0);

          results.push({
            ...params,
            trades: allTrades.length,
            winners: winners.length,
            losers: losers.length,
            totalPnL: +totalPnL.toFixed(2),
            totalFunding: +totalFunding.toFixed(2),
            totalPricePnl: +totalPricePnl.toFixed(2),
            winRate: +winRate.toFixed(1),
            avgWin: +avgWin.toFixed(2),
            avgLoss: +avgLoss.toFixed(2),
            sharpe: +sharpe.toFixed(3),
            maxDD: +maxDD.toFixed(2),
            pnlPerTrade: +(totalPnL / allTrades.length).toFixed(2),
          });
        }
      }
    }
  }

  // 4. Sort by total PnL and display
  results.sort((a, b) => b.totalPnL - a.totalPnL);

  console.log("\n" + "=".repeat(120));
  console.log("TOP 20 PARAMETER COMBINATIONS (by total PnL)");
  console.log("=".repeat(120));

  const header = [
    "Rank", "EntryAPR", "SL%", "Trail%", "ExitAPR",
    "Trades", "W/L", "WinRate", "TotalPnL", "Funding", "PricePnL",
    "AvgWin", "AvgLoss", "$/Trade", "Sharpe", "MaxDD"
  ];
  console.log(header.map((h, i) => h.padEnd(i === 0 ? 5 : i < 5 ? 9 : 9)).join(""));
  console.log("-".repeat(120));

  for (let i = 0; i < Math.min(20, results.length); i++) {
    const r = results[i];
    if (r.trades === 0) continue;
    const row = [
      (i + 1).toString(),
      r.entryAPR.toString(),
      r.stopLossPct.toString(),
      r.trailingStopPct.toString(),
      r.exitAPR.toString(),
      r.trades.toString(),
      `${r.winners}/${r.losers}`,
      r.winRate + "%",
      "$" + r.totalPnL,
      "$" + r.totalFunding,
      "$" + r.totalPricePnl,
      "$" + r.avgWin,
      "$" + r.avgLoss,
      "$" + r.pnlPerTrade,
      r.sharpe.toString(),
      "$" + r.maxDD,
    ];
    console.log(row.map((v, j) => v.padEnd(j === 0 ? 5 : j === 6 ? 9 : 9)).join(""));
  }

  // 5. Show worst 5 for contrast
  console.log("\n" + "=".repeat(120));
  console.log("BOTTOM 5 PARAMETER COMBINATIONS");
  console.log("=".repeat(120));
  console.log(header.map((h, i) => h.padEnd(i === 0 ? 5 : i < 5 ? 9 : 9)).join(""));
  console.log("-".repeat(120));

  const bottom = results.filter((r) => r.trades > 0).slice(-5).reverse();
  for (let i = 0; i < bottom.length; i++) {
    const r = bottom[i];
    const rank = results.indexOf(r) + 1;
    const row = [
      rank.toString(),
      r.entryAPR.toString(),
      r.stopLossPct.toString(),
      r.trailingStopPct.toString(),
      r.exitAPR.toString(),
      r.trades.toString(),
      `${r.winners}/${r.losers}`,
      r.winRate + "%",
      "$" + r.totalPnL,
      "$" + r.totalFunding,
      "$" + r.totalPricePnl,
      "$" + r.avgWin,
      "$" + r.avgLoss,
      "$" + r.pnlPerTrade,
      r.sharpe.toString(),
      "$" + r.maxDD,
    ];
    console.log(row.map((v, j) => v.padEnd(j === 0 ? 5 : j === 6 ? 9 : 9)).join(""));
  }

  // 6. Key insights
  console.log("\n" + "=".repeat(80));
  console.log("KEY INSIGHTS");
  console.log("=".repeat(80));

  // Best by different metrics
  const bestPnL = results.filter((r) => r.trades >= 5)[0];
  const bestSharpe = results.filter((r) => r.trades >= 5).sort((a, b) => b.sharpe - a.sharpe)[0];
  const bestWinRate = results.filter((r) => r.trades >= 5).sort((a, b) => b.winRate - a.winRate)[0];
  const bestPerTrade = results.filter((r) => r.trades >= 5).sort((a, b) => b.pnlPerTrade - a.pnlPerTrade)[0];

  if (bestPnL) {
    console.log(`\nBest Total PnL:  entryAPR=${bestPnL.entryAPR} SL=${bestPnL.stopLossPct}% trail=${bestPnL.trailingStopPct}% exit=${bestPnL.exitAPR}`);
    console.log(`  → $${bestPnL.totalPnL} over ${bestPnL.trades} trades (${bestPnL.winRate}% win rate, $${bestPnL.pnlPerTrade}/trade)`);
  }
  if (bestSharpe) {
    console.log(`\nBest Sharpe:     entryAPR=${bestSharpe.entryAPR} SL=${bestSharpe.stopLossPct}% trail=${bestSharpe.trailingStopPct}% exit=${bestSharpe.exitAPR}`);
    console.log(`  → Sharpe ${bestSharpe.sharpe}, $${bestSharpe.totalPnL} over ${bestSharpe.trades} trades`);
  }
  if (bestWinRate) {
    console.log(`\nBest Win Rate:   entryAPR=${bestWinRate.entryAPR} SL=${bestWinRate.stopLossPct}% trail=${bestWinRate.trailingStopPct}% exit=${bestWinRate.exitAPR}`);
    console.log(`  → ${bestWinRate.winRate}% win rate, $${bestWinRate.totalPnL} over ${bestWinRate.trades} trades`);
  }
  if (bestPerTrade) {
    console.log(`\nBest $/Trade:    entryAPR=${bestPerTrade.entryAPR} SL=${bestPerTrade.stopLossPct}% trail=${bestPerTrade.trailingStopPct}% exit=${bestPerTrade.exitAPR}`);
    console.log(`  → $${bestPerTrade.pnlPerTrade}/trade, $${bestPerTrade.totalPnL} over ${bestPerTrade.trades} trades`);
  }

  // Trailing stop analysis
  console.log("\n--- Trailing Stop Impact (averaged across other params) ---");
  for (const trail of PARAM_GRID.trailingStopPct) {
    const group = results.filter((r) => r.trailingStopPct === trail && r.trades >= 5);
    if (group.length === 0) continue;
    const avgPnL = group.reduce((s, r) => s + r.totalPnL, 0) / group.length;
    const avgWinRate = group.reduce((s, r) => s + r.winRate, 0) / group.length;
    const avgPerTrade = group.reduce((s, r) => s + r.pnlPerTrade, 0) / group.length;
    console.log(`  Trail ${trail}%: avg PnL=$${avgPnL.toFixed(2)}, avg win rate=${avgWinRate.toFixed(1)}%, avg $/trade=$${avgPerTrade.toFixed(2)} (${group.length} combos)`);
  }

  // Entry APR analysis
  console.log("\n--- Entry APR Impact (averaged across other params) ---");
  for (const apr of PARAM_GRID.entryAPR) {
    const group = results.filter((r) => r.entryAPR === apr && r.trades >= 1);
    if (group.length === 0) continue;
    const avgPnL = group.reduce((s, r) => s + r.totalPnL, 0) / group.length;
    const avgTrades = group.reduce((s, r) => s + r.trades, 0) / group.length;
    const avgPerTrade = group.filter((r) => r.trades >= 1).reduce((s, r) => s + r.pnlPerTrade, 0) / group.length;
    console.log(`  APR ${apr}: avg PnL=$${avgPnL.toFixed(2)}, avg trades=${avgTrades.toFixed(0)}, avg $/trade=$${avgPerTrade.toFixed(2)} (${group.length} combos)`);
  }

  // Stop loss analysis
  console.log("\n--- Stop Loss Impact (averaged across other params) ---");
  for (const sl of PARAM_GRID.stopLossPct) {
    const group = results.filter((r) => r.stopLossPct === sl && r.trades >= 5);
    if (group.length === 0) continue;
    const avgPnL = group.reduce((s, r) => s + r.totalPnL, 0) / group.length;
    const avgWinRate = group.reduce((s, r) => s + r.winRate, 0) / group.length;
    const avgPerTrade = group.reduce((s, r) => s + r.pnlPerTrade, 0) / group.length;
    console.log(`  SL ${sl}%: avg PnL=$${avgPnL.toFixed(2)}, avg win rate=${avgWinRate.toFixed(1)}%, avg $/trade=$${avgPerTrade.toFixed(2)} (${group.length} combos)`);
  }

  console.log("\nDone! Tested " + results.length + " parameter combinations across " + Object.keys(coinData).length + " coins.\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
