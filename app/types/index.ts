// ═══ Core domain types for Hedge Deal Sniffer ═══

export interface Bet {
  id: string;
  q: string;           // Question text
  od: number;          // Base odds (YES %)
  v: number;           // Odds volatility for history generation
  th: number | null;   // Threshold price (null for non-price bets)
  url: string;         // Polymarket URL
  currentOdds: number; // Real-time odds
  oddsHistory: OddsPoint[];
}

export interface OddsPoint {
  t: number;
  odds: number;
}

export interface PricePoint {
  t: number;
  price: number;
}

export interface Asset {
  sym: string;
  name: string;
  cat: string;         // Category
  pr: number;          // Current price
  vl: number;          // Price volatility for history generation
  bets: Bet[];
  priceHistory: PricePoint[];
}

export interface SeedBet {
  id: string;
  q: string;
  od: number;
  v: number;
  th: number | null;
  url: string;
}

export interface SeedAsset {
  sym: string;
  name: string;
  cat: string;
  pr: number;
  vl: number;
  bets: SeedBet[];
}

export interface Hedge {
  betId: string;
  side: "yes" | "no";
  size: number;
}

export interface Scenario {
  valuation: number;
  perpPL: number;
  hedgePL: number;
  netPL: number;
  isLiq: boolean;
  pos: number;
  neg: number;
  varRed: number | null;
  varGreen: number | null;
}

export interface RiskMetrics {
  breakeven: number;
  worst: number;
  best: number;
  vol: number;
  mean: number;
  liqPrice: number;
}

export interface PriceVariance {
  low: number;
  high: number;
  avg: number;
}

export interface Correlation {
  betId: string;
  question: string;
  correlation: number;
}

export interface OptimResult {
  config: Hedge[];
  score: number;
  metrics: {
    mean: number;
    worst: number;
    best: number;
    cost: number;
    worstImprove: number;
    meanChange: number;
  };
  baseMean: number;
  baseWorst: number;
}

export type Direction = "long" | "short";
export type VarPeriod = "1d" | "3d" | "7d" | "14d" | "30d";
