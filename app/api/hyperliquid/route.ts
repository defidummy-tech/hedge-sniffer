// ═══ Server-side proxy for Hyperliquid API (avoids CORS) ═══

var cache: Record<string, { data: any; timestamp: number }> = {};

// Different TTLs by request type
var CACHE_TTLS: Record<string, number> = {
  metaAndAssetCtxs: 60000, // 1 min — funding rates don't change fast
  perpDexs: 300000,        // 5 min — dex list rarely changes
  candleSnapshot: 120000,  // 2 min — candles don't need to be real-time
  fundingHistory: 120000,  // 2 min
  allMids: 15000,          // 15s — prices move faster
};
var DEFAULT_CACHE_TTL = 30000; // 30s fallback

export async function POST(request: Request) {
  var body = await request.json();

  // Build cache key from all relevant fields
  var cacheKey = body.type + (body.dex ? ":dex=" + body.dex : "") +
    (body.coin ? ":coin=" + body.coin : "") +
    (body.req ? ":req=" + JSON.stringify(body.req) : "");

  var ttl = CACHE_TTLS[body.type] || DEFAULT_CACHE_TTL;
  if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < ttl) {
    return Response.json(cache[cacheKey].data);
  }

  var res = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return Response.json({ error: "Hyperliquid API error: " + res.status }, { status: res.status });
  }

  var data = await res.json();
  cache[cacheKey] = { data: data, timestamp: Date.now() };

  return Response.json(data);
}
