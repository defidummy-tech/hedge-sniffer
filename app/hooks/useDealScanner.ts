"use client";
import { useMemo } from "react";
import type { Asset, Deal } from "../types";
import { scanDeals } from "../services/dealScanner";

/** Scan all assets and rank by opportunity quality */
export function useDealScanner(assets: Asset[]): Deal[] {
  return useMemo(function() {
    return scanDeals(assets);
  }, [assets]);
}
