// ═══ Maps Polymarket search terms to asset symbols ═══

export interface MarketMapping {
  sym: string;
  coin: string;            // Hyperliquid API coin name (e.g. "BTC" or "vntl:OPENAI")
  searchTerms: string[];   // Keywords to match in Polymarket event titles
  cat: string;
  name: string;
  hasPerp: boolean;        // Whether this asset has a Hyperliquid perp
  isVentual: boolean;      // Whether this is a Ventuals/pre-launch token
}

// Ventuals/pre-launch tokens known on Hyperliquid
export var VENTUAL_COINS = ["vntl:OPENAI", "vntl:SPACEX", "vntl:ANTHROPIC"];

export const PRIORITY_MAPPINGS: MarketMapping[] = [
  { sym: "BTC",       coin: "BTC",             name: "Bitcoin",       cat: "Crypto / L1",        hasPerp: true,  isVentual: false, searchTerms: ["bitcoin", "btc"] },
  { sym: "ETH",       coin: "ETH",             name: "Ethereum",      cat: "Crypto / L1",        hasPerp: true,  isVentual: false, searchTerms: ["ethereum", "eth"] },
  { sym: "SOL",       coin: "SOL",             name: "Solana",        cat: "Crypto / L1",        hasPerp: true,  isVentual: false, searchTerms: ["solana", "sol"] },
  { sym: "XRP",       coin: "XRP",             name: "XRP",           cat: "Crypto / Payments",  hasPerp: true,  isVentual: false, searchTerms: ["xrp", "ripple"] },
  { sym: "HYPE",      coin: "HYPE",            name: "Hyperliquid",   cat: "DeFi / L1",         hasPerp: true,  isVentual: false, searchTerms: ["hyperliquid"] },
  { sym: "DOGE",      coin: "DOGE",            name: "Dogecoin",      cat: "Meme / Crypto",     hasPerp: true,  isVentual: false, searchTerms: ["dogecoin", "doge"] },
  { sym: "LINK",      coin: "LINK",            name: "Chainlink",     cat: "Oracle / DeFi",     hasPerp: true,  isVentual: false, searchTerms: ["chainlink", "link"] },
  { sym: "TRUMP",     coin: "TRUMP",           name: "Trump Media",   cat: "Politics / Crypto",  hasPerp: true,  isVentual: false, searchTerms: ["trump"] },
  { sym: "MSTR",      coin: "MSTR",            name: "MicroStrategy", cat: "BTC Treasury",       hasPerp: true,  isVentual: false, searchTerms: ["microstrategy", "mstr"] },
  // Ventuals / Pre-IPO tokens (use vntl: prefix for HL API)
  { sym: "OPENAI",    coin: "vntl:OPENAI",     name: "OpenAI",        cat: "AI / Pre-IPO",       hasPerp: true,  isVentual: true,  searchTerms: ["openai"] },
  { sym: "SPACEX",    coin: "vntl:SPACEX",     name: "SpaceX",        cat: "Space / Pre-IPO",    hasPerp: true,  isVentual: true,  searchTerms: ["spacex", "space x"] },
  { sym: "ANTHROPIC", coin: "vntl:ANTHROPIC",  name: "Anthropic",     cat: "AI / Pre-IPO",       hasPerp: true,  isVentual: true,  searchTerms: ["anthropic", "claude"] },
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
    if (pm.isVentual) {
      // Ventuals are always included — their data comes from separate fetches
      result.push(pm);
    } else {
      // Update hasPerp based on whether HL actually lists it
      var hasIt = hlNames.indexOf(pm.sym) !== -1;
      result.push({ ...pm, hasPerp: hasIt || pm.hasPerp });
    }
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
      coin: c.name,
      name: c.name,
      cat: "Discovered",
      hasPerp: true,
      isVentual: false,
      searchTerms: [c.name.toLowerCase()],
    });
  }

  return result;
}
