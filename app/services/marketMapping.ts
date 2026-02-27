// ═══ Maps Polymarket search terms to asset symbols ═══

export interface MarketMapping {
  sym: string;
  searchTerms: string[];  // Keywords to match in Polymarket event titles
  cat: string;
  name: string;
  hasPerp: boolean;       // Whether this asset has a Hyperliquid perp
}

export const MARKET_MAPPINGS: MarketMapping[] = [
  { sym: "BTC",    name: "Bitcoin",       cat: "Crypto / L1",        hasPerp: true,  searchTerms: ["bitcoin", "btc"] },
  { sym: "ETH",    name: "Ethereum",      cat: "Crypto / L1",        hasPerp: true,  searchTerms: ["ethereum", "eth"] },
  { sym: "SOL",    name: "Solana",        cat: "Crypto / L1",        hasPerp: true,  searchTerms: ["solana", "sol"] },
  { sym: "XRP",    name: "XRP",           cat: "Crypto / Payments",  hasPerp: true,  searchTerms: ["xrp", "ripple"] },
  { sym: "HYPE",   name: "Hyperliquid",   cat: "DeFi / L1",         hasPerp: true,  searchTerms: ["hyperliquid"] },
  { sym: "DOGE",   name: "Dogecoin",      cat: "Meme / Crypto",     hasPerp: true,  searchTerms: ["dogecoin", "doge"] },
  { sym: "LINK",   name: "Chainlink",     cat: "Oracle / DeFi",     hasPerp: true,  searchTerms: ["chainlink", "link"] },
  { sym: "TRUMP",  name: "Trump Media",   cat: "Politics / Crypto",  hasPerp: false, searchTerms: ["trump"] },
  { sym: "OPENAI", name: "OpenAI",        cat: "AI / Tech",          hasPerp: false, searchTerms: ["openai"] },
  { sym: "MSTR",   name: "MicroStrategy", cat: "BTC Treasury",       hasPerp: false, searchTerms: ["microstrategy", "mstr"] },
];

/** Extract a dollar threshold from a question string, e.g. "$100,000" → 100000 */
export function extractThreshold(question: string): number | null {
  var match = question.match(/\$([0-9,]+\.?\d*)/);
  if (!match) return null;
  return parseFloat(match[1].replace(/,/g, ""));
}
