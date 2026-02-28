"use client";
import { useState, useCallback } from "react";
import type { BacktestResult } from "../types";

export function useBacktest() {
  var [data, setData] = useState<BacktestResult | null>(null);
  var [loading, setLoading] = useState(false);
  var [error, setError] = useState<string | null>(null);
  var [threshold, setThreshold] = useState(10.0); // 1000% APR
  var [lookback, setLookback] = useState(30);
  var [elapsed, setElapsed] = useState<string | null>(null);

  var run = useCallback(async function() {
    setLoading(true);
    setError(null);
    setElapsed(null);
    try {
      var res = await fetch("/api/backtest?threshold=" + threshold + "&lookback=" + lookback);
      var json = await res.json();
      if (!json.ok) throw new Error(json.error || "Backtest failed");
      setData({
        episodes: json.episodes || [],
        tokenSummaries: json.tokenSummaries || [],
        avgDecayCurve: json.avgDecayCurve || {},
        totalEpisodes: json.totalEpisodes || 0,
        avgDuration: json.avgDuration || 0,
        medianDuration: json.medianDuration || 0,
        avgRevertHours: json.avgRevertHours || 0,
        revertPct: json.revertPct || 0,
        avgEarnings7d: json.avgEarnings7d || 0,
        medianEarnings7d: json.medianEarnings7d || 0,
      });
      setElapsed(json.elapsed || null);
    } catch (e: any) {
      setError(e.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [threshold, lookback]);

  return { data, loading, error, threshold, setThreshold, lookback, setLookback, run, elapsed };
}
