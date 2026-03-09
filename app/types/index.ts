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

export interface FundingPoint {
  t: number;           // Timestamp (ms)
  rate: number;        // Hourly funding rate (decimal)
  apr: number;         // Annualized (rate × 8760)
  premium: number;     // Premium at this point
}

export interface Asset {
  sym: string;
  name: string;
  cat: string;         // Category
  pr: number;          // Current price
  vl: number;          // Price volatility for history generation
  bets: Bet[];
  priceHistory: PricePoint[];
  fundingRate: number;               // Current hourly funding rate (decimal)
  fundingRateAPR: number;            // Annualized: fundingRate × 8760
  fundingRateHistory: FundingPoint[];
  openInterest: number;              // Current OI in USD
  dayNtlVlm: number;                // 24h notional volume
  premium: number;                   // Mark-oracle premium
  hasPerp: boolean;                  // Whether asset has an HL perp
  coin?: string;                     // HL API coin name (e.g. "BTC" or "vntl:OPENAI")
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
  fundingRate?: number;
  openInterest?: number;
  dayNtlVlm?: number;
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
  fundingPL: number;
  totalNetPL: number;   // netPL + fundingPL
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
  dailyFunding: number;
  fundingAPR: number;
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
    fundingPL: number;
    netYieldAPR: number;
  };
  baseMean: number;
  baseWorst: number;
}

export interface ProfitZone {
  lowPrice: number;
  highPrice: number;
  minProfit: number;
  widthPct: number;
  varianceCoverage: number;
}

export interface FundingYield {
  dailyIncome: number;
  weeklyIncome: number;
  monthlyIncome: number;
  annualizedAPR: number;
  hedgeCost: number;
  netAPR: number;
  breakEvenRate: number;
  rateVolatility: number;
}

export type DealType = "funding_harvest" | "directional_hedge" | "correlation_play";

export interface Deal {
  assetIdx: number;
  sym: string;
  name: string;
  type: DealType;
  score: number;
  fundingAPR: number;
  bestHedgeCost: number;
  netYieldAPR: number;
  description: string;
}

export type Direction = "long" | "short";
export type VarPeriod = "1d" | "3d" | "7d" | "14d" | "30d";
export type AppView = "scanner" | "sniffer" | "backtest" | "bot" | "performance";
export type OptimizerMode = "balanced" | "funding_harvest" | "directional";

// ── Backtest types ──

export interface BacktestEpisode {
  token: string;
  startTime: number;
  peakAPR: number;
  direction: "short-pays" | "long-pays";
  durationHours: number;
  stillActive: boolean;
  aprAfter: Record<string, number | null>;  // "1h", "4h", "12h", "24h", "48h", "168h"
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

export interface BacktestTokenSummary {
  token: string;
  episodes: number;
  avgPeakAPR: number;
  avgDuration: number;
  revertPct: number;
  avgEarnings7d: number;
  avgHoldHours: number;
  avgFundingHold: number;
  avgPricePnl: number;
  avgNetReturn: number;
}

export interface BacktestResult {
  episodes: BacktestEpisode[];
  tokenSummaries: BacktestTokenSummary[];
  avgDecayCurve: Record<string, number>;  // "1h" -> avg APR
  totalEpisodes: number;
  avgDuration: number;
  medianDuration: number;
  avgRevertHours: number;
  revertPct: number;
  avgEarnings7d: number;
  medianEarnings7d: number;
  avgHoldHours: number;
  avgFundingHold: number;
  avgPricePnl: number;
  avgNetReturn: number;
  medianNetReturn: number;
}

// ── Bot / Trade types ──

export type TradeStatus = "open" | "closed" | "stopped";

export interface BotTrade {
  id: string;
  coin: string;
  direction: "long" | "short";
  sizeUSD: number;
  leverage: number;
  entryPrice: number;
  entryTime: number;
  entryFundingAPR: number;
  exitPrice: number | null;
  exitTime: number | null;
  exitFundingAPR: number | null;
  exitReason: string | null;
  pnl: number;
  fundingEarned: number;
  totalReturn: number;
  status: TradeStatus;
  spotHedge: boolean;
  spotEntryPrice: number | null;
  spotExitPrice: number | null;
  paper?: boolean;
  lastFundingCheck?: number;
  stopPrice?: number | null;
  settlementsCaptured?: number;  // How many funding settlements captured so far
  spotSizeUSD?: number;          // USD size of spot hedge (if active)
}

export interface BotConfig {
  enabled: boolean;
  testnet: boolean;
  entryAPR: number;
  exitAPR: number;
  maxPositionUSD: number;
  leverage: number;
  maxPositions: number;
  stopLossPct: number;
  maxHoldHours: number;
  fundingLockMinutes: number;
  slCooldownHours: number;    // Hours to wait before re-entering a coin after stop-loss
  takeProfitPct: number;      // Close when profit exceeds this % (0 = disabled)
  minVolume: number;          // Min 24h volume in USD to enter (0 = off)
  minOI: number;              // Min open interest in USD to enter (0 = off)
  maxDropPct: number;         // Skip entry if price dropped > this % in last 4h (0 = off)
  maxOIPct: number;           // Max position as % of token OI (0 = off)
  minHoldSettlements: number; // Hold through at least N funding settlements before exit (except SL)
  reEntryCooldownHours: number; // Wait N hours before re-entering ANY coin after ANY exit
  entryWindowMinutes: number; // Only enter within N minutes of funding settlement (0 = off)
  minFundingPersistHours: number; // Require funding above entry threshold for N consecutive hours (0 = off)
  spotHedge: boolean;
  spotHedgeRatio: number;
  paperTrading: boolean;
  paperBalance: number;
}

export interface BotStatus {
  config: BotConfig;
  accountBalance: number;
  marginUsed: number;
  openPositions: BotTrade[];
  recentActions: Array<{ time: number; action: string; detail: string }>;
}

export interface PerformanceStats {
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  totalPnL: number;
  totalFundingEarned: number;
  winRate: number;
  avgReturn: number;
  bestTrade: number;
  worstTrade: number;
  avgHoldHours: number;
  longWinRate: number;
  shortWinRate: number;
}
