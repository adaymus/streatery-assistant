/**
 * Cloudflare Pages Function: MAR geocoder proxy.
 *
 * In dev, `vite.config.ts` proxies `/api/mar/*` to citizen-atlas while
 * stripping WAF-triggering headers. In production on Pages, THIS function
 * does the same job. Same path convention (`/api/mar/<endpoint>?<query>`),
 * same header scrubbing, same JSON passthrough.
 *
 * The `[[path]]` filename means this is a catch-all route: any URL under
 * `/api/mar/` (including `/api/mar/findLocation2`, `/api/mar/anything/at/all`)
 * hits this handler.
 *
 * Why this function exists at all:
 *   1. citizen-atlas doesn't send CORS headers — browser fetch is blocked
 *   2. citizen-atlas is fronted by an F5 WAF that rejects requests with
 *      browser-identifying headers (Origin, Referer, Sec-Fetch-*, browser
 *      User-Agent) with an HTML "Request Rejected" page
 *
 * The fix is a single round-trip rewrite: clean the request, forward,
 * return the upstream body untouched.
 */

const UPSTREAM_BASE =
  "https://citizenatlas.dc.gov/newwebservices/locationverifier.asmx";

// Headers that trip citizen-atlas's WAF when forwarded as-is. Strip all
// of them and replace with a non-browser User-Agent before calling out.
const HEADERS_TO_STRIP = [
  "origin",
  "referer",
  "sec-fetch-mode",
  "sec-fetch-site",
  "sec-fetch-dest",
  "sec-fetch-user",
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
  "cookie",
  "user-agent",
] as const;

// Pages Functions run in the Workers runtime, which provides web-standard
// Request/Response/fetch. No Node imports needed.
export const onRequest: PagesFunction = async (context) => {
  const incoming = context.request;
  const incomingUrl = new URL(incoming.url);

  // Translate `/api/mar/findLocation2?...` to the upstream URL.
  const upstreamPath = incomingUrl.pathname.replace(/^\/api\/mar/, "");
  const upstreamUrl = `${UPSTREAM_BASE}${upstreamPath}${incomingUrl.search}`;

  // Build a clean header set. Skip the WAF-triggering ones and force a
  // boring server-style User-Agent.
  const cleanHeaders = new Headers();
  for (const [name, value] of incoming.headers.entries()) {
    if (HEADERS_TO_STRIP.includes(name.toLowerCase() as never)) continue;
    cleanHeaders.set(name, value);
  }
  cleanHeaders.set("User-Agent", "streatery-prescreener/1.0");
  cleanHeaders.set("Accept", "application/json");

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method: incoming.method,
      headers: cleanHeaders,
      // Pass the body through for non-GET methods. findLocation2 uses GET,
      // but staying general means the proxy keeps working if we add POST
      // calls later.
      body:
        incoming.method === "GET" || incoming.method === "HEAD"
          ? undefined
          : incoming.body,
    });
  } catch (err) {
    // Network-level failure (citizen-atlas down, DNS issue). Surface a
    // 502 so the client knows it's an upstream problem, not a code bug.
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: "Upstream fetch failed", detail: message }),
      {
        status: 502,
        headers: { "content-type": "application/json" },
      },
    );
  }

  // Pass the body straight through. Replace only the headers we care
  // about (content-type and CORS — the rest of upstream's headers aren't
  // useful to the client).
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: {
      "content-type":
        upstreamResponse.headers.get("content-type") ?? "application/json",
      // Pages serves the function on the same origin as the static
      // assets, so a same-origin XHR doesn't need CORS. Setting it
      // explicitly makes the proxy reusable from other origins later
      // (e.g., a CLI tool, or testing from a different localhost port).
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });
};
