// Caching proxy for GeckoTerminal's public API.
//
// Why this exists: GeckoTerminal's free tier caps out at 30 requests/minute.
// With every user's browser calling GeckoTerminal directly, that budget is
// shared across however many people are using the app at once — it falls
// over fast with real traffic. This Worker sits between the app and
// GeckoTerminal: the first request for a given URL fetches from
// GeckoTerminal and caches the response at Cloudflare's edge; every request
// for that same URL within CACHE_TTL_SECONDS is served straight from cache,
// with no call to GeckoTerminal at all. GeckoTerminal then sees a trickle
// of requests from us, no matter how many people are using the app.
//
// Deploy (Cloudflare dashboard, no CLI needed):
//   1. dash.cloudflare.com -> sign up free if you don't have an account
//   2. Workers & Pages -> Create -> Create Worker
//   3. Name it (e.g. "ton-board-proxy") -> Deploy
//   4. "Edit code" -> replace the default contents with this whole file -> Save and Deploy
//   5. Copy the resulting URL (looks like https://ton-board-proxy.<you>.workers.dev)
//   6. Send me that URL — I'll point the app's GT_BASE at it instead of
//      calling api.geckoterminal.com directly.

const UPSTREAM = "https://api.geckoterminal.com/api/v2";
const CACHE_TTL_SECONDS = 30;

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }));
    if (request.method !== "GET") return withCors(new Response("Method not allowed", { status: 405 }));

    const url = new URL(request.url);
    const upstreamUrl = UPSTREAM + url.pathname + url.search;

    // Cloudflare's shared edge cache — keyed on the upstream URL, so every
    // visitor asking for the same pool/token/timeframe within the TTL hits
    // the same cached entry instead of a fresh GeckoTerminal call each.
    const cacheKey = new Request(upstreamUrl, request);
    const cache = caches.default;

    let response = await cache.match(cacheKey);
    if (response) return withCors(response);

    const upstreamRes = await fetch(upstreamUrl, {
      headers: { accept: "application/json" },
      cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
    });

    response = new Response(upstreamRes.body, upstreamRes);
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL_SECONDS}`);
    ctx.waitUntil(cache.put(cacheKey, response.clone()));

    return withCors(response);
  },
};

function withCors(response) {
  const res = new Response(response.body, response);
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  return res;
}
