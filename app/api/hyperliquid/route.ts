// ═══ Server-side proxy for Hyperliquid API (avoids CORS) ═══

var cache: Record<string, { data: any; timestamp: number }> = {};
var CACHE_TTL = 60000; // 1 minute

export async function POST(request: Request) {
  var body = await request.json();

  // Build cache key: type + optional dex parameter
  var cacheKey = body.type + (body.dex ? ":" + body.dex : "");

  // Cache metaAndAssetCtxs and perpDexs responses (called frequently)
  var cacheable = body.type === "metaAndAssetCtxs" || body.type === "perpDexs";
  if (cacheable && cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_TTL) {
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

  if (cacheable) {
    cache[cacheKey] = { data: data, timestamp: Date.now() };
  }

  return Response.json(data);
}
