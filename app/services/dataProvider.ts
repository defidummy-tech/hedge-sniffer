// ═══ Data provider: seed data + simulated history generators ═══

import type { Asset, SeedAsset, PricePoint, OddsPoint, FundingPoint } from "../types";

// ── Simulated history generators ──

/** Generate 168 hours (7 days) of simulated price history */
export function genPriceHistory(base: number, vol: number): PricePoint[] {
  var h: PricePoint[] = [], p = base;
  for (var i = 0; i < 168; i++) {
    p += (Math.random() - 0.48) * vol;
    p = Math.max(base * 0.6, Math.min(base * 1.6, p));
    h.push({ t: i, price: +(p.toFixed(4)) });
  }
  return h;
}

/** Generate 168 hours (7 days) of simulated odds history */
export function genOddsHistory(base: number, vol: number): OddsPoint[] {
  var h: OddsPoint[] = [], p = base;
  for (var i = 0; i < 168; i++) {
    p += (Math.random() - 0.5) * vol;
    p = Math.max(5, Math.min(95, p));
    h.push({ t: i, odds: +(p.toFixed(1)) });
  }
  return h;
}

/** Generate 168 hours (7 days) of simulated funding rate history */
export function genFundingHistory(baseRate: number): FundingPoint[] {
  var h: FundingPoint[] = [], rate = baseRate;
  var now = Date.now();
  for (var i = 0; i < 168; i++) {
    rate += (Math.random() - 0.5) * Math.abs(baseRate) * 0.3;
    rate = Math.max(-0.001, Math.min(0.001, rate));
    h.push({
      t: now - (168 - i) * 3600000,
      rate: +rate.toFixed(8),
      apr: +(rate * 8760).toFixed(4),
      premium: +(rate * 0.8).toFixed(8),
    });
  }
  return h;
}

// ── Seed data ──

export const SEED: SeedAsset[] = [
  { sym: "BTC", name: "Bitcoin", cat: "Crypto / L1", pr: 71200, vl: 800, fundingRate: 0.0000125, openInterest: 500000000, dayNtlVlm: 2000000000, bets: [
    { id: "btc1", q: "Bitcoin above $80,000 in February 2026?", od: 17, v: 3, th: 80000, url: "polymarket.com/crypto/bitcoin" },
    { id: "btc2", q: "Bitcoin above $100,000 in 2026?", od: 55, v: 4, th: 100000, url: "polymarket.com/event/what-price-will-bitcoin-hit-before-2027" },
    { id: "btc3", q: "Bitcoin below $60,000 in February 2026?", od: 38, v: 3.5, th: 60000, url: "polymarket.com/crypto/bitcoin" }
  ] },
  { sym: "ETH", name: "Ethereum", cat: "Crypto / L1", pr: 2090, vl: 35, fundingRate: 0.0000082, openInterest: 200000000, dayNtlVlm: 800000000, bets: [
    { id: "eth1", q: "Ethereum above $3,000 by March 31, 2026?", od: 6, v: 2, th: 3000, url: "polymarket.com/crypto" },
    { id: "eth2", q: "Ethereum above $2,500 in 2026?", od: 42, v: 3, th: 2500, url: "polymarket.com/crypto" },
    { id: "eth3", q: "Fed 25 bps rate cut by March 2026 FOMC?", od: 28, v: 2.5, th: null, url: "polymarket.com" }
  ] },
  { sym: "SOL", name: "Solana", cat: "Crypto / L1", pr: 84.5, vl: 3.5, fundingRate: 0.0000150, openInterest: 100000000, dayNtlVlm: 400000000, bets: [
    { id: "sol1", q: "Solana above $120 in 2026?", od: 35, v: 3, th: 120, url: "polymarket.com/predictions/solana" },
    { id: "sol2", q: "Solana above $100 by March 2026?", od: 12, v: 2, th: 100, url: "polymarket.com/predictions/solana" },
    { id: "sol3", q: "Solana all-time high by June 2026?", od: 8, v: 1.8, th: 294, url: "polymarket.com/predictions/solana" }
  ] },
  { sym: "TRUMP", name: "Trump Media", cat: "Politics / Crypto", pr: 34, vl: 1.2, bets: [
    { id: "t1", q: "Trump launches new cryptocurrency by end of 2026?", od: 27, v: 2.5, th: null, url: "polymarket.com" },
    { id: "t2", q: "Trump approval above 50% in February?", od: 35, v: 2.2, th: null, url: "polymarket.com/predictions/trump" },
    { id: "t3", q: "US government shutdown in 2026?", od: 65, v: 2.8, th: null, url: "polymarket.com" }
  ] },
  { sym: "OPENAI", name: "OpenAI", cat: "AI / Tech", pr: 715, vl: 8, fundingRate: 0.000120, openInterest: 5000000, dayNtlVlm: 20000000, bets: [
    { id: "oa1", q: "OpenAI IPO by December 31, 2026?", od: 52, v: 2.5, th: null, url: "polymarket.com/event/openai-ipo-by" },
    { id: "oa2", q: "OpenAI $1T+ IPO before 2027?", od: 20, v: 2, th: null, url: "polymarket.com/event/openai-1t-valuation-in-2026" },
    { id: "oa3", q: "Which company has best AI model end of March? (OpenAI)", od: 48, v: 2.3, th: null, url: "polymarket.com/predictions/ai" }
  ] },
  { sym: "XRP", name: "XRP", cat: "Crypto / Payments", pr: 1.32, vl: 0.08, fundingRate: 0.0000050, openInterest: 50000000, dayNtlVlm: 150000000, bets: [
    { id: "xrp1", q: "XRP above $2.00 by March 2026?", od: 15, v: 2.5, th: 2.0, url: "polymarket.com/crypto" },
    { id: "xrp2", q: "XRP all-time high by June 2026?", od: 7, v: 1.5, th: 3.84, url: "polymarket.com/crypto" }
  ] },
  { sym: "HYPE", name: "Hyperliquid", cat: "DeFi / L1", pr: 22, vl: 0.8, fundingRate: 0.0000200, openInterest: 30000000, dayNtlVlm: 80000000, bets: [
    { id: "h1", q: "Bitcoin above $100,000 in 2026?", od: 55, v: 4, th: 100000, url: "polymarket.com/event/what-price-will-bitcoin-hit-before-2027" },
    { id: "h2", q: "Ethereum above $3,000 in 2026?", od: 28, v: 2, th: 3000, url: "polymarket.com/crypto" }
  ] },
  { sym: "DOGE", name: "Dogecoin", cat: "Meme / Crypto", pr: 0.14, vl: 0.008, fundingRate: 0.0000180, openInterest: 40000000, dayNtlVlm: 200000000, bets: [
    { id: "doge1", q: "Dogecoin above $0.25 by March 2026?", od: 10, v: 2, th: 0.25, url: "polymarket.com/crypto" },
    { id: "doge2", q: "Trump launches new cryptocurrency by end of 2026?", od: 27, v: 2.5, th: null, url: "polymarket.com" }
  ] },
  { sym: "MSTR", name: "MicroStrategy", cat: "BTC Treasury", pr: 185, vl: 12, bets: [
    { id: "ms1", q: "Bitcoin above $85,000 by February 28, 2026?", od: 9, v: 2.5, th: 85000, url: "polymarket.com/crypto/bitcoin" },
    { id: "ms2", q: "Bitcoin above $100,000 in 2026?", od: 55, v: 4, th: 100000, url: "polymarket.com/event/what-price-will-bitcoin-hit-before-2027" },
    { id: "ms3", q: "MicroStrategy: Nothing Ever Happens", od: 62, v: 2, th: null, url: "polymarket.com/predictions/bitcoin" }
  ] },
  { sym: "LINK", name: "Chainlink", cat: "Oracle / DeFi", pr: 10.5, vl: 0.6, fundingRate: 0.0000060, openInterest: 25000000, dayNtlVlm: 60000000, bets: [
    { id: "lnk1", q: "Bitcoin above $80,000 in February 2026?", od: 17, v: 3, th: 80000, url: "polymarket.com/crypto/bitcoin" },
    { id: "lnk2", q: "Fed rate cut before June 2026?", od: 45, v: 2, th: null, url: "polymarket.com" }
  ] },
];

// ── Asset initialization ──

/** Initialize assets from seed data with generated histories */
export function initAssets(): Asset[] {
  return SEED.map(function(a) {
    var fr = a.fundingRate || 0;
    return {
      ...a,
      priceHistory: genPriceHistory(a.pr, a.vl),
      bets: a.bets.map(function(b) {
        return { ...b, currentOdds: b.od, oddsHistory: genOddsHistory(b.od, b.v) };
      }),
      fundingRate: fr,
      fundingRateAPR: fr * 8760,
      fundingRateHistory: genFundingHistory(fr),
      openInterest: a.openInterest || 0,
      dayNtlVlm: a.dayNtlVlm || 0,
      premium: 0,
      hasPerp: !!a.fundingRate,
    };
  });
}
