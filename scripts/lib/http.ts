import { HttpError } from './errors.js';
import { log } from './log.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 3;
const USER_AGENT = 'dmv-housing-app/0.1 (+https://github.com/yourname/dmv-housing-app)';

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  /** Used for log messages and error context */
  label?: string;
  method?: string;
  body?: string;
}

/**
 * fetch with retry, exponential backoff, and Retry-After honoring.
 * Throws HttpError on non-2xx after all retries are exhausted.
 */
export async function fetchWithRetry(url: string, options: FetchOptions = {}): Promise<Response> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    headers = {},
    label = url,
    method,
    body,
  } = options;

  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        method,
        body,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json, text/csv, text/tab-separated-values, */*',
          ...headers,
        },
      });
      clearTimeout(timeout);

      if (res.ok) {
        return res;
      }

      const bodyExcerpt = await res
        .text()
        .then((t) => t.slice(0, 500))
        .catch(() => '<no body>');

      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        const retryAfter = res.headers.get('retry-after');
        const waitMs = retryAfter
          ? parseRetryAfter(retryAfter)
          : backoffMs(attempt);

        if (attempt < retries) {
          log.warn(
            { label, status: res.status, attempt, waitMs },
            'retrying after retryable HTTP status',
          );
          await sleep(waitMs);
          continue;
        }
      }

      throw new HttpError(res.status, url, bodyExcerpt);
    } catch (err) {
      clearTimeout(timeout);
      lastErr = err;

      if (err instanceof HttpError) {
        // Non-retryable HTTP error; bubble out immediately
        if (err.status < 500 && err.status !== 429) {
          throw err;
        }
      }

      if (attempt < retries) {
        const waitMs = backoffMs(attempt);
        log.warn(
          { label, attempt, waitMs, err: errMessage(err) },
          'retrying after fetch error',
        );
        await sleep(waitMs);
        continue;
      }
      throw err;
    }
  }

  throw lastErr ?? new Error(`fetchWithRetry exhausted retries for ${url}`);
}

export async function fetchJson<T = unknown>(url: string, options?: FetchOptions): Promise<T> {
  const res = await fetchWithRetry(url, options);
  return (await res.json()) as T;
}

export async function fetchText(url: string, options?: FetchOptions): Promise<string> {
  const res = await fetchWithRetry(url, options);
  return res.text();
}

export async function fetchBuffer(url: string, options?: FetchOptions): Promise<Buffer> {
  const res = await fetchWithRetry(url, options);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function backoffMs(attempt: number): number {
  // 500ms, 1s, 2s, 4s, ...
  return 500 * 2 ** attempt;
}

function parseRetryAfter(value: string): number {
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return 1000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
