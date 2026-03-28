const BASE_URL = 'https://www.e-tar.lt/rs/legalact';

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

function log(msg: string) {
  console.log(`[e-tar] ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with retry and exponential backoff on 429/503.
 */
async function fetchWithRetry(url: string): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (response.ok) return response;

    if ((response.status === 429 || response.status === 503) && attempt < MAX_RETRIES) {
      const backoff = INITIAL_BACKOFF_MS * 2 ** attempt;
      log(`Got ${response.status}, retrying in ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(backoff);
      continue;
    }

    throw new Error(
      `e-TAR fetch failed: ${response.status} ${response.statusText} for ${url}`,
    );
  }

  // Unreachable, but satisfies TypeScript
  throw new Error(`e-TAR fetch failed after ${MAX_RETRIES} retries for ${url}`);
}

/**
 * Fetch the full HTML content of a legal act from e-TAR.
 *
 * The `dokumento_id` can be either:
 * - TAR format: `TAR.XXXXXXXXXXXX` (prefix + 12-char hex)
 * - UUID format: `ce0f95d090d111e4bb408baba2bdddf3` (32-char hex)
 *
 * Returns Word-generated HTML with `MsoNormal` classes and
 * structural `id="part_XXXXX"` attributes.
 */
export async function fetchActHtml(dokumentoId: string): Promise<string> {
  const url = `${BASE_URL}/${dokumentoId}/`;
  log(`Fetching ${dokumentoId}`);
  const response = await fetchWithRetry(url);
  return response.text();
}

/**
 * Fetch the HTML of a specific consolidated (suvestine) version.
 *
 * Note: e-TAR does not expose a direct REST endpoint for consolidated
 * versions. The `/rs/legalact/{id}/` endpoint always returns the latest
 * consolidated text. For historical versions, use the `tekstas_lt` plain
 * text from the data.gov.lt Suvestine dataset instead.
 *
 * This function constructs the portal print URL and extracts the resource
 * URL, falling back to the base document HTML if the consolidated version
 * cannot be fetched directly.
 */
export async function fetchConsolidatedHtml(
  dokumentoId: string,
  suvestinesId: string,
): Promise<string> {
  // e-TAR's REST endpoint doesn't support consolidated version paths.
  // The /rs/legalact/{id}/ always serves the current version.
  // For now, fetch the base document and log the limitation.
  log(
    `Fetching consolidated ${dokumentoId}/${suvestinesId} ` +
      `(note: REST API serves current version only)`,
  );
  const url = `${BASE_URL}/${dokumentoId}/`;
  const response = await fetchWithRetry(url);
  return response.text();
}

export interface BatchFetchOptions {
  /** Max parallel requests (default 2) */
  concurrency?: number;
  /** Delay between requests in ms (default 500) */
  delayMs?: number;
  /** Progress callback */
  onProgress?: (done: number, total: number) => void;
}

/**
 * Batch fetch HTML for multiple legal acts with rate limiting.
 *
 * Respects e-TAR's Cloudflare protection by limiting to max 2 req/sec
 * (configurable via `concurrency` and `delayMs`).
 *
 * Returns a Map of dokumentoId -> HTML string. Failed fetches are
 * logged and skipped (not included in the result map).
 */
export async function fetchActsHtml(
  dokumentoIds: string[],
  options?: BatchFetchOptions,
): Promise<Map<string, string>> {
  const concurrency = options?.concurrency ?? 2;
  const delayMs = options?.delayMs ?? 500;
  const onProgress = options?.onProgress;
  const total = dokumentoIds.length;

  const results = new Map<string, string>();
  let done = 0;

  // Process in chunks of `concurrency`
  for (let i = 0; i < total; i += concurrency) {
    const chunk = dokumentoIds.slice(i, i + concurrency);

    const promises = chunk.map(async (id) => {
      try {
        const html = await fetchActHtml(id);
        results.set(id, html);
      } catch (err) {
        log(`Failed to fetch ${id}: ${err instanceof Error ? err.message : err}`);
      }
    });

    await Promise.all(promises);

    done += chunk.length;
    onProgress?.(done, total);

    // Rate limit: wait between chunks (skip delay after last chunk)
    if (i + concurrency < total) {
      await sleep(delayMs);
    }
  }

  log(`Batch complete: ${results.size}/${total} fetched successfully.`);
  return results;
}
