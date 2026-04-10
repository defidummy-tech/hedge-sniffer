// ═══ Server-side proxy for Polymarket Gamma + CLOB APIs (avoids CORS) ═══

var GAMMA = "https://gamma-api.polymarket.com";
var CLOB = "https://clob.polymarket.com";

var pmCache: Record<string, { data: any; timestamp: number }> = {};
var PM_CACHE_TTL = 120000; // 2 min — event/odds data doesn't change fast

export async function GET(request: Request) {
  var url = new URL(request.url);
  var endpoint = url.searchParams.get("endpoint");
  if (!endpoint) {
    return Response.json({ error: "Missing endpoint param" }, { status: 400 });
  }

  // Check cache
  var cacheKey = url.search;
  if (pmCache[cacheKey] && Date.now() - pmCache[cacheKey].timestamp < PM_CACHE_TTL) {
    return Response.json(pmCache[cacheKey].data);
  }

  // Build the target URL
  var params = new URLSearchParams(url.searchParams);
  params.delete("endpoint");
  var target: string;

  if (endpoint === "events" || endpoint === "markets") {
    target = GAMMA + "/" + endpoint + "?" + params.toString();
  } else {
    // CLOB endpoints: prices-history, price, midpoint
    target = CLOB + "/" + endpoint + "?" + params.toString();
  }

  var res = await fetch(target);

  if (!res.ok) {
    return Response.json({ error: "Polymarket API error: " + res.status }, { status: res.status });
  }

  var data = await res.json();
  pmCache[cacheKey] = { data: data, timestamp: Date.now() };
  return Response.json(data);
}
