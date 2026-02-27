// ═══ Server-side proxy for Hyperliquid API (avoids CORS) ═══

var cache: { data: any; timestamp: number } | null = null;
var CACHE_TTL = 60000; // 1 minute

export async function POST(request: Request) {
  var body = await request.json();

  // Cache the metaAndAssetCtxs response (called frequently)
  if (body.type === "metaAndAssetCtxs" && cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return Response.json(cache.data);
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

  if (body.type === "metaAndAssetCtxs") {
    cache = { data: data, timestamp: Date.now() };
  }

  return Response.json(data);
}
