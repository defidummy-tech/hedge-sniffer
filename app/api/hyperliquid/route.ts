// ═══ Server-side proxy for Hyperliquid API (avoids CORS) ═══

var cache: Record<string, { data: any; timestamp: number }> = {};

// In-flight request deduplication — if the same cache key is already being fetched,
// wait for that result instead of firing a duplicate request to HL
var inflight: Record<string, Promise<any>> = {};

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
  var body: any;
  try {
    body = await request.json();
  } catch (e: any) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Build cache key from all relevant fields
  var cacheKey = body.type + (body.dex ? ":dex=" + body.dex : "") +
    (body.coin ? ":coin=" + body.coin : "") +
    (body.req ? ":req=" + JSON.stringify(body.req) : "");

  var ttl = CACHE_TTLS[body.type] || DEFAULT_CACHE_TTL;
  if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < ttl) {
    return Response.json(cache[cacheKey].data);
  }

  // If this exact request is already in-flight, wait for it instead of firing a duplicate
  if (inflight[cacheKey]) {
    try {
      var shared = await inflight[cacheKey];
      return Response.json(shared);
    } catch (e: any) {
      return Response.json({ error: "Hyperliquid API error (shared): " + (e.message || "unknown") }, { status: 502 });
    }
  }

  // Fire the request and register it as in-flight
  var fetchPromise = fetchFromHL(body, cacheKey);
  inflight[cacheKey] = fetchPromise;

  try {
    var data = await fetchPromise;
    return Response.json(data);
  } catch (e: any) {
    var status = e.hlStatus || 502;
    return Response.json({ error: "Hyperliquid API error: " + (e.message || "unknown") }, { status: status });
  } finally {
    delete inflight[cacheKey];
  }
}

async function fetchFromHL(body: any, cacheKey: string): Promise<any> {
  var res: Response;
  try {
    res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000), // 15s timeout — don't let hung requests block forever
    });
  } catch (e: any) {
    // Network error, DNS failure, timeout, connection reset
    var err = new Error("Network error: " + (e.message || "fetch failed")) as any;
    err.hlStatus = 502;
    throw err;
  }

  if (!res.ok) {
    var err2 = new Error("HTTP " + res.status) as any;
    err2.hlStatus = res.status;
    throw err2;
  }

  var data = await res.json();
  cache[cacheKey] = { data: data, timestamp: Date.now() };
  return data;
}
