// ═══ Maps Polymarket search terms to asset symbols ═══

export interface MarketMapping {
  sym: string;
  searchTerms: string[];  // Keywords to match in Polymarket event titles
  cat: string;
  name: string;
  hasPerp: boolean;       // Whether this asset has a Hyperliquid perp
}

export const PRIORITY_MAPPINGS: MarketMapping[] = [
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

// Keep backward-compatible export
export var MARKET_MAPPINGS = PRIORITY_MAPPINGS;

/** Extract a dollar threshold from a question string, e.g. "$100,000" → 100000 */
export function extractThreshold(question: string): number | null {
  var match = question.match(/\$([0-9,]+\.?\d*)/);
  if (!match) return null;
  return parseFloat(match[1].replace(/,/g, ""));
}

/** Dynamically build the full asset list from HL perps + priority mappings */
export function buildAssetList(
  hlNames: string[],
  hlFunding: Record<string, number>,
  hlVolume: Record<string, number>,
  hlOI: Record<string, number>
): MarketMapping[] {
  var result: MarketMapping[] = [];
  var seen = new Set<string>();

  // Phase 1: All priority-mapped assets first
  for (var i = 0; i < PRIORITY_MAPPINGS.length; i++) {
    var pm = PRIORITY_MAPPINGS[i];
    // Update hasPerp based on whether HL actually lists it
    var hasIt = hlNames.indexOf(pm.sym) !== -1;
    result.push({ ...pm, hasPerp: hasIt || pm.hasPerp });
    seen.add(pm.sym);
  }

  // Phase 2: Discover interesting HL perps not in priority list
  var candidates: Array<{ name: string; absAPR: number; volume: number }> = [];
  for (var j = 0; j < hlNames.length; j++) {
    var name = hlNames[j];
    if (seen.has(name)) continue;
    var fundingAPR = Math.abs((hlFunding[name] || 0) * 8760);
    var vol = hlVolume[name] || 0;
    // Include if: funding APR > 10% OR daily volume > $1M
    if (fundingAPR > 0.10 || vol > 1000000) {
      candidates.push({ name: name, absAPR: fundingAPR, volume: vol });
    }
  }

  // Sort by abs funding rate descending (most interesting deals first)
  candidates.sort(function(a, b) { return b.absAPR - a.absAPR; });

  // Take top 20 discovered assets
  for (var k = 0; k < Math.min(20, candidates.length); k++) {
    var c = candidates[k];
    result.push({
      sym: c.name,
      name: c.name,
      cat: "Discovered",
      hasPerp: true,
      searchTerms: [c.name.toLowerCase()],
    });
  }

  return result;
}
