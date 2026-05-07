import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithRetry, fetchJson } from './http.js';
import { HttpError } from './errors.js';

function makeResponse(status: number, body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('returns the response on a 200', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(200, '{"ok":true}'));
    vi.stubGlobal('fetch', mockFetch);

    const res = await fetchWithRetry('https://example.com/api');
    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws HttpError immediately on 404 (non-retryable)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(404, 'not found'));
    vi.stubGlobal('fetch', mockFetch);

    await expect(fetchWithRetry('https://example.com/api')).rejects.toThrow(HttpError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries on 500 up to the retry limit', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(500, 'server error'));
    vi.stubGlobal('fetch', mockFetch);

    // Attach rejection handler before advancing timers to avoid unhandled rejection warning
    const assertion = expect(
      fetchWithRetry('https://example.com/api', { retries: 2, timeoutMs: 5000 }),
    ).rejects.toThrow(HttpError);
    await vi.runAllTimersAsync();
    await assertion;
    expect(mockFetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('retries on 429 and respects Retry-After (seconds)', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(429, 'rate limited', { 'retry-after': '1' }))
      .mockResolvedValueOnce(makeResponse(200, '{}'));
    vi.stubGlobal('fetch', mockFetch);

    const assertion = fetchWithRetry('https://example.com/api', { retries: 2, timeoutMs: 5000 });
    await vi.runAllTimersAsync();
    const res = await assertion;
    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('succeeds on second attempt after a 503', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(503, 'unavailable'))
      .mockResolvedValueOnce(makeResponse(200, '{"data":"ok"}'));
    vi.stubGlobal('fetch', mockFetch);

    const assertion = fetchWithRetry('https://example.com/api', { retries: 1, timeoutMs: 5000 });
    await vi.runAllTimersAsync();
    const res = await assertion;
    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe('fetchJson', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses JSON from a successful response', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(200, '{"value":42}'));
    vi.stubGlobal('fetch', mockFetch);

    const data = await fetchJson<{ value: number }>('https://example.com/api');
    expect(data).toEqual({ value: 42 });
  });

  it('throws on non-2xx', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(403, 'forbidden'));
    vi.stubGlobal('fetch', mockFetch);

    await expect(fetchJson('https://example.com/api')).rejects.toThrow(HttpError);
  });
});
