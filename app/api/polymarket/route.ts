// ═══ Server-side proxy for Polymarket Gamma + CLOB APIs (avoids CORS) ═══

var GAMMA = "https://gamma-api.polymarket.com";
var CLOB = "https://clob.polymarket.com";

var pmCache: Record<string, { data: any; timestamp: number }> = {};
var PM_CACHE_TTL = 120000; // 2 min — event/odds data doesn't change fast

// In-flight deduplication (same pattern as HL proxy)
var pmInflight: Record<string, Promise<any>> = {};

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

  // Deduplicate in-flight requests
  if (pmInflight[cacheKey]) {
    try {
      var shared = await pmInflight[cacheKey];
      return Response.json(shared);
    } catch (e: any) {
      return Response.json({ error: "Polymarket API error (shared): " + (e.message || "unknown") }, { status: 502 });
    }
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

  var fetchPromise = fetchFromPM(target, cacheKey);
  pmInflight[cacheKey] = fetchPromise;

  try {
    var data = await fetchPromise;
    return Response.json(data);
  } catch (e: any) {
    var status = e.pmStatus || 502;
    return Response.json({ error: "Polymarket API error: " + (e.message || "unknown") }, { status: status });
  } finally {
    delete pmInflight[cacheKey];
  }
}

async function fetchFromPM(target: string, cacheKey: string): Promise<any> {
  var res: Response;
  try {
    res = await fetch(target, {
      signal: AbortSignal.timeout(15000), // 15s timeout
    });
  } catch (e: any) {
    var err = new Error("Network error: " + (e.message || "fetch failed")) as any;
    err.pmStatus = 502;
    throw err;
  }

  if (!res.ok) {
    var err2 = new Error("HTTP " + res.status) as any;
    err2.pmStatus = res.status;
    throw err2;
  }

  var data = await res.json();
  pmCache[cacheKey] = { data: data, timestamp: Date.now() };
  return data;
}
