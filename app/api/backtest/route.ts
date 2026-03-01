// ═══ Backtest API: funding rate spike analysis + price impact ═══

import { NextResponse } from "next/server";

var HL_API = "https://api.hyperliquid.xyz/info";
var HOURS_PER_YEAR = 8760;
var LOOKBACK_WINDOWS = [1, 4, 12, 24, 48, 168];
var MAX_HOLD_HOURS = 7 * 24; // 168h max hold (matches bot default)

async function hlFetch(body: any): Promise<any> {
  var res = await fetch(HL_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("HL API " + res.status);
  return res.json();
}

async function fetchFundingHistoryPaginated(coin: string, lookbackDays: number): Promise<any[]> {
  var startTime = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  var allData: any[] = [];
  var cursor = startTime;

  while (true) {
    var data = await hlFetch({ type: "fundingHistory", coin: coin, startTime: cursor });
    if (!data || !Array.isArray(data) || data.length === 0) break;
    allData = allData.concat(data);
    if (data.length < 500) break;
    cursor = data[data.length - 1].time + 1;
  }

  // Deduplicate
  var seen = new Set<number>();
  return allData.filter(function(e) {
    if (seen.has(e.time)) return false;
    seen.add(e.time);
    return true;
  });
}

// ── Price data fetching ──

async function fetchCandleSnapshot(coin: string, startTime: number, endTime: number): Promise<any[]> {
  try {
    var data = await hlFetch({
      type: "candleSnapshot",
      req: { coin: coin, interval: "1h", startTime: startTime, endTime: endTime },
    });
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function findPrice(candles: any[], targetTime: number): number | null {
  if (!candles || candles.length === 0) return null;
  var closest: any = null;
  var closestDiff = Infinity;

  for (var i = 0; i < candles.length; i++) {
    var candleTime = candles[i].t;
    var diff = Math.abs(candleTime - targetTime);
    if (diff < closestDiff) {
      closestDiff = diff;
      closest = candles[i];
    }
  }

  // Accept if within 6 hours of target (increased from 2h to handle data gaps)
  if (closest && closestDiff < 21600000) {
    return parseFloat(closest.c); // close price
  }
  return null;
}

// ── Episode types and analysis ──

interface Episode {
  token: string;
  startTime: number;
  peakAPR: number;
  direction: "short-pays" | "long-pays";
  durationHours: number;
  stillActive: boolean;
  aprAfter: Record<string, number | null>;
  revertedBelow100: boolean;
  revertHours: number | null;
  cumulativeFunding7d: number;
  holdHours: number;
  cumulativeFundingHold: number;
  priceAtEntry: number | null;
  priceAtExit: number | null;
  pricePnlPct: number | null;
  netReturn: number | null;
}

function identifyAndAnalyzeEpisodes(
  history: any[],
  coin: string,
  extremeRate: number,
  revertRate: number,
  candles: any[]
): Episode[] {
  if (!history || history.length === 0) return [];
  history.sort(function(a, b) { return a.time - b.time; });

  var episodes: Episode[] = [];
  var inEpisode = false;
  var epStart = 0;
  var epPeakRate = 0;
  var epDirection: "short-pays" | "long-pays" = "short-pays";

  for (var i = 0; i < history.length; i++) {
    var rate = parseFloat(history[i].fundingRate);
    var absRate = Math.abs(rate);
    var isExtreme = absRate > extremeRate;

    if (isExtreme && !inEpisode) {
      inEpisode = true;
      epStart = history[i].time;
      epPeakRate = absRate;
      epDirection = rate > 0 ? "long-pays" : "short-pays";
    } else if (isExtreme && inEpisode) {
      if (absRate > epPeakRate) epPeakRate = absRate;
    } else if (!isExtreme && inEpisode) {
      var dur = (history[i].time - epStart) / (3600000);
      var ep = analyzeEpisode(history, coin, epStart, epPeakRate, epDirection, dur, false, revertRate, candles);
      episodes.push(ep);
      inEpisode = false;
    }
  }

  // Still active episode
  if (inEpisode) {
    var lastTime = history[history.length - 1].time;
    var durActive = (lastTime - epStart) / 3600000;
    var epActive = analyzeEpisode(history, coin, epStart, epPeakRate, epDirection, durActive, true, revertRate, candles);
    episodes.push(epActive);
  }

  return episodes;
}

function analyzeEpisode(
  history: any[],
  coin: string,
  startTime: number,
  peakRate: number,
  direction: "short-pays" | "long-pays",
  durationHours: number,
  stillActive: boolean,
  revertRate: number,
  candles: any[]
): Episode {
  var aprAfter: Record<string, number | null> = {};

  // Post-spike APR at each window
  for (var wi = 0; wi < LOOKBACK_WINDOWS.length; wi++) {
    var hours = LOOKBACK_WINDOWS[wi];
    var targetTime = startTime + hours * 3600000;
    var closest: any = null;
    var closestDiff = Infinity;

    for (var hi = 0; hi < history.length; hi++) {
      var diff = Math.abs(history[hi].time - targetTime);
      if (diff < closestDiff) { closestDiff = diff; closest = history[hi]; }
    }

    if (closest && closestDiff < 7200000) {
      aprAfter[hours + "h"] = Math.abs(parseFloat(closest.fundingRate)) * HOURS_PER_YEAR;
    } else {
      aprAfter[hours + "h"] = null;
    }
  }

  // Reversion check — when does funding drop below 100% APR?
  var revertedBelow100 = false;
  var revertHours: number | null = null;
  var sevenDaysAfter = startTime + 7 * 24 * 3600000;

  for (var ri = 0; ri < history.length; ri++) {
    if (history[ri].time > startTime && history[ri].time <= sevenDaysAfter) {
      if (Math.abs(parseFloat(history[ri].fundingRate)) < revertRate) {
        revertedBelow100 = true;
        revertHours = (history[ri].time - startTime) / 3600000;
        break;
      }
    }
  }

  // ── Determine realistic hold period ──
  // Bot would exit when funding reverts below exit threshold, or at max hold (7 days)
  // Minimum 1 hour: bot can't detect + open + close faster than one funding period
  var holdHours: number;
  if (stillActive) {
    holdHours = Math.max(1, durationHours); // still open, use current duration
  } else if (revertedBelow100 && revertHours !== null) {
    holdHours = Math.max(1, revertHours); // exited when funding reverted
  } else {
    holdHours = MAX_HOLD_HOURS; // stayed elevated, capped at max hold
  }

  var exitTime = startTime + holdHours * 3600000;

  // Cumulative funding over full 7 days (kept for reference)
  var cumRate7d = 0;
  for (var ci = 0; ci < history.length; ci++) {
    if (history[ci].time >= startTime && history[ci].time <= startTime + 7 * 24 * 3600000) {
      cumRate7d += Math.abs(parseFloat(history[ci].fundingRate));
    }
  }

  // Cumulative funding over actual hold period
  var cumRateHold = 0;
  for (var ch = 0; ch < history.length; ch++) {
    if (history[ch].time >= startTime && history[ch].time <= exitTime) {
      cumRateHold += Math.abs(parseFloat(history[ch].fundingRate));
    }
  }

  // ── Price impact over hold period ──
  var priceAtEntry = findPrice(candles, startTime);
  var priceAtExit = findPrice(candles, exitTime);

  var pricePnlPct: number | null = null;
  var netReturn: number | null = null;

  if (priceAtEntry !== null && priceAtExit !== null && priceAtEntry > 0) {
    if (direction === "long-pays") {
      // We go SHORT: profit when price drops
      pricePnlPct = (priceAtEntry - priceAtExit) / priceAtEntry;
    } else {
      // We go LONG: profit when price rises
      pricePnlPct = (priceAtExit - priceAtEntry) / priceAtEntry;
    }
    netReturn = cumRateHold + pricePnlPct;
  }

  return {
    token: coin,
    startTime: startTime,
    peakAPR: peakRate * HOURS_PER_YEAR,
    direction: direction,
    durationHours: durationHours,
    stillActive: stillActive,
    aprAfter: aprAfter,
    revertedBelow100: revertedBelow100,
    revertHours: revertHours,
    cumulativeFunding7d: cumRate7d,
    holdHours: holdHours,
    cumulativeFundingHold: cumRateHold,
    priceAtEntry: priceAtEntry,
    priceAtExit: priceAtExit,
    pricePnlPct: pricePnlPct,
    netReturn: netReturn,
  };
}

export async function GET(request: Request) {
  var url = new URL(request.url);
  var thresholdAPR = parseFloat(url.searchParams.get("threshold") || "10.0"); // 1000%
  var lookbackDays = parseInt(url.searchParams.get("lookback") || "30", 10);

  var extremeRate = thresholdAPR / HOURS_PER_YEAR;
  var revertRate = 1.0 / HOURS_PER_YEAR; // 100% APR

  var startMs = Date.now();

  try {
    // 1. Get all perps
    var data = await hlFetch({ type: "metaAndAssetCtxs" });
    var meta = data[0];
    var ctxs = data[1];

    var tokens: Array<{ name: string; fundingRate: number; absAPR: number }> = [];
    for (var i = 0; i < meta.universe.length; i++) {
      var fr = parseFloat(ctxs[i].funding);
      tokens.push({ name: meta.universe[i].name, fundingRate: fr, absAPR: Math.abs(fr) * HOURS_PER_YEAR });
    }
    tokens.sort(function(a, b) { return b.absAPR - a.absAPR; });

    // Top 20 by funding rate
    var top20 = tokens.slice(0, 20);

    // 2. Fetch funding history AND candle data for top 20 in parallel
    var lookbackStart = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
    var now = Date.now();

    var fundingFetches = top20.map(function(t) {
      return fetchFundingHistoryPaginated(t.name, lookbackDays);
    });
    var candleFetches = top20.map(function(t) {
      return fetchCandleSnapshot(t.name, lookbackStart, now);
    });

    var allFetches = await Promise.allSettled([...fundingFetches, ...candleFetches]);

    var histories: Record<string, any[]> = {};
    var candleMap: Record<string, any[]> = {};

    for (var fi = 0; fi < top20.length; fi++) {
      // Funding results are in first 20 slots
      if (allFetches[fi].status === "fulfilled") {
        histories[top20[fi].name] = (allFetches[fi] as PromiseFulfilledResult<any[]>).value;
      }
      // Candle results are in slots 20-39
      var candleIdx = fi + top20.length;
      if (allFetches[candleIdx].status === "fulfilled") {
        candleMap[top20[fi].name] = (allFetches[candleIdx] as PromiseFulfilledResult<any[]>).value;
      }
    }

    // 3. Analyze episodes
    var allEpisodes: Episode[] = [];
    var tokenSummaries: Array<{
      token: string; episodes: number; avgPeakAPR: number; avgDuration: number;
      revertPct: number; avgEarnings7d: number;
      avgHoldHours: number; avgFundingHold: number; avgPricePnl: number; avgNetReturn: number;
    }> = [];

    for (var ti = 0; ti < top20.length; ti++) {
      var tokenName = top20[ti].name;
      var history = histories[tokenName];
      if (!history || history.length === 0) continue;

      var candles = candleMap[tokenName] || [];
      var episodes = identifyAndAnalyzeEpisodes(history, tokenName, extremeRate, revertRate, candles);
      if (episodes.length === 0) continue;

      allEpisodes = allEpisodes.concat(episodes);

      // Token summary
      var sumPeak = 0, sumDur = 0, sumEarn = 0, revCount = 0;
      var sumHold = 0, sumFundHold = 0;
      var sumPricePnl = 0, pricePnlCount = 0, sumNetReturn = 0, netReturnCount = 0;
      for (var ei = 0; ei < episodes.length; ei++) {
        sumPeak += episodes[ei].peakAPR;
        sumDur += episodes[ei].durationHours;
        sumEarn += episodes[ei].cumulativeFunding7d;
        sumHold += episodes[ei].holdHours;
        sumFundHold += episodes[ei].cumulativeFundingHold;
        if (episodes[ei].revertedBelow100) revCount++;
        if (episodes[ei].pricePnlPct !== null) {
          sumPricePnl += episodes[ei].pricePnlPct!;
          pricePnlCount++;
        }
        if (episodes[ei].netReturn !== null) {
          sumNetReturn += episodes[ei].netReturn!;
          netReturnCount++;
        }
      }
      tokenSummaries.push({
        token: tokenName,
        episodes: episodes.length,
        avgPeakAPR: sumPeak / episodes.length,
        avgDuration: sumDur / episodes.length,
        revertPct: (revCount / episodes.length) * 100,
        avgEarnings7d: sumEarn / episodes.length,
        avgHoldHours: sumHold / episodes.length,
        avgFundingHold: sumFundHold / episodes.length,
        avgPricePnl: pricePnlCount > 0 ? sumPricePnl / pricePnlCount : 0,
        avgNetReturn: netReturnCount > 0 ? sumNetReturn / netReturnCount : 0,
      });
    }

    // 4. Compute aggregate stats
    var durations = allEpisodes.map(function(e) { return e.durationHours; });
    var earnings = allEpisodes.map(function(e) { return e.cumulativeFunding7d; });
    var revertTimes = allEpisodes.filter(function(e) { return e.revertedBelow100 && e.revertHours !== null; }).map(function(e) { return e.revertHours!; });
    var holdHoursList = allEpisodes.map(function(e) { return e.holdHours; });
    var fundingHolds = allEpisodes.map(function(e) { return e.cumulativeFundingHold; });
    var pricePnls = allEpisodes.filter(function(e) { return e.pricePnlPct !== null; }).map(function(e) { return e.pricePnlPct!; });
    var netReturns = allEpisodes.filter(function(e) { return e.netReturn !== null; }).map(function(e) { return e.netReturn!; });

    var avg = function(arr: number[]) { return arr.length ? arr.reduce(function(s, v) { return s + v; }, 0) / arr.length : 0; };
    var med = function(arr: number[]) {
      if (!arr.length) return 0;
      var s = arr.slice().sort(function(a, b) { return a - b; });
      var m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    };

    // Decay curve
    var decayCurve: Record<string, number> = {};
    for (var di = 0; di < LOOKBACK_WINDOWS.length; di++) {
      var key = LOOKBACK_WINDOWS[di] + "h";
      var vals: number[] = [];
      for (var dj = 0; dj < allEpisodes.length; dj++) {
        var v = allEpisodes[dj].aprAfter[key];
        if (v !== null && v !== undefined) vals.push(v);
      }
      decayCurve[key] = vals.length ? avg(vals) : 0;
    }

    var reverted = allEpisodes.filter(function(e) { return e.revertedBelow100; });

    var result = {
      episodes: allEpisodes,
      tokenSummaries: tokenSummaries,
      avgDecayCurve: decayCurve,
      totalEpisodes: allEpisodes.length,
      avgDuration: +avg(durations).toFixed(1),
      medianDuration: +med(durations).toFixed(1),
      avgRevertHours: +avg(revertTimes).toFixed(1),
      revertPct: allEpisodes.length ? +(reverted.length / allEpisodes.length * 100).toFixed(1) : 0,
      avgEarnings7d: +avg(earnings).toFixed(6),
      medianEarnings7d: +med(earnings).toFixed(6),
      avgHoldHours: +avg(holdHoursList).toFixed(1),
      avgFundingHold: +avg(fundingHolds).toFixed(6),
      avgPricePnl: +avg(pricePnls).toFixed(6),
      avgNetReturn: +avg(netReturns).toFixed(6),
      medianNetReturn: +med(netReturns).toFixed(6),
    };

    var elapsed = Date.now() - startMs;

    return NextResponse.json({
      ok: true,
      elapsed: elapsed + "ms",
      threshold: thresholdAPR,
      lookbackDays: lookbackDays,
      tokensScanned: top20.length,
      ...result,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "unknown" }, { status: 500 });
  }
}
