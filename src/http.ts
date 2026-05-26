/**
 * Shared HTTP helpers for talking to DC Open Data and citizen-atlas endpoints.
 *
 * Both the ArcGIS REST APIs (maps2.dcgis.dc.gov) and the MAR geocoder
 * (citizenatlas.dc.gov) return JSON. Centralizing fetch + parse means each
 * data fetcher only has to model its own response shape.
 */

/**
 * Fetch a URL and parse the response as JSON, with simple retry on transient
 * failures.
 *
 * DC's ArcGIS endpoints occasionally return 503 ("Wait timeout for the
 * request exceeded") when under load. We retry up to twice with exponential
 * backoff (300ms, 900ms) before giving up. Permanent failures (404, 400,
 * etc.) fail immediately — no point retrying those.
 *
 * Also handles ArcGIS's idiosyncratic error format: the HTTP response can
 * be a 200 OK but the JSON body contains `{ error: { code, message } }`
 * indicating a soft failure (e.g., 503 wrapped in a 200). We surface those
 * as errors too.
 *
 * Returns `unknown` because at this layer we don't know the response shape;
 * each caller narrows the result with a type assertion. Returning `unknown`
 * (rather than `any`) forces callers to acknowledge that narrowing step,
 * which catches typos in field names at compile time.
 */
export async function fetchJson(url: string): Promise<unknown> {
  const maxAttempts = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        // 5xx is server-side; worth retrying. 4xx is the request's fault;
        // no point retrying — fail fast so we can fix the call.
        if (response.status >= 500 && attempt < maxAttempts) {
          await sleep(300 * Math.pow(3, attempt - 1));
          continue;
        }
        throw new Error(
          `HTTP ${response.status} ${response.statusText} at ${url}`,
        );
      }
      const body = (await response.json()) as unknown;

      // ArcGIS sometimes returns 200 OK with an error wrapped inside the
      // body. Detect that pattern and treat it as a retryable failure.
      const wrappedError = (body as { error?: { code?: number; message?: string } })
        ?.error;
      if (wrappedError) {
        const code = wrappedError.code ?? 0;
        if (code >= 500 && attempt < maxAttempts) {
          await sleep(300 * Math.pow(3, attempt - 1));
          continue;
        }
        throw new Error(
          `ArcGIS error ${code}: ${wrappedError.message ?? "unknown"} at ${url}`,
        );
      }

      return body;
    } catch (err) {
      lastError = err;
      // Network errors (DNS failure, connection reset) are usually transient.
      const isNetworkError = err instanceof TypeError;
      if (isNetworkError && attempt < maxAttempts) {
        await sleep(300 * Math.pow(3, attempt - 1));
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new Error(`Failed after ${maxAttempts} attempts: ${url}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build a URL query string from a flat object of params.
 *
 * ArcGIS WHERE clauses contain spaces, quotes, and equals signs that have
 * special meaning in URLs. encodeURIComponent escapes them. Doing this in a
 * helper is more readable than hand-concatenating strings at every call site.
 */
export function buildQuery(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}
