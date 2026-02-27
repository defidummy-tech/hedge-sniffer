"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import type { Asset } from "../types";
import { initAssets } from "../services/dataProvider";
import { fetchLiveAssets } from "../services/liveDataProvider";

var REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function useAssets() {
  // Start with simulated data so the UI renders instantly
  var [assets, setAssets] = useState<Asset[]>(initAssets);
  var [isLive, setIsLive] = useState(false);
  var [loading, setLoading] = useState(true);
  var [error, setError] = useState<string | null>(null);
  var intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  var refresh = useCallback(async function() {
    try {
      setLoading(true);
      var result = await fetchLiveAssets();
      setAssets(result.assets);
      if (result.liveCount > 0) {
        setIsLive(true);
        setError(null);
      } else {
        setIsLive(false);
        setError("APIs unreachable — using simulated data");
      }
    } catch {
      setIsLive(false);
      setError("Live data unavailable — using simulated data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(function() {
    refresh();
    intervalRef.current = setInterval(refresh, REFRESH_INTERVAL);
    return function() {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  return { assets: assets, isLive: isLive, loading: loading, error: error, refresh: refresh };
}
