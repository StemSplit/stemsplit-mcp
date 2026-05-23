import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StemSplitClient } from '../src/client.js';
import type { Config } from '../src/config.js';

const config: Config = {
  apiKey: 'sk_live_test',
  baseUrl: 'https://stemsplit.example.com/api/v1',
  defaultOutputDir: '/tmp/stemsplit',
  serverName: 'stemsplit-mcp',
  serverVersion: '0.1.0',
};

const originalFetch = globalThis.fetch;

function mockFetchResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
}

describe('StemSplitClient', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('sends Bearer header on GET /balance', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockFetchResponse({
        balanceSeconds: 3600,
        balanceMinutes: 60,
        balanceFormatted: '60 minutes',
        updatedAt: '2026-01-01T00:00:00Z',
      }),
    );

    const client = new StemSplitClient(config);
    const balance = await client.getBalance();

    expect(balance.balanceMinutes).toBe(60);
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://stemsplit.example.com/api/v1/balance');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk_live_test');
  });

  it('throws StemSplitError on 402 INSUFFICIENT_CREDITS', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockFetchResponse(
        {
          error: {
            code: 'INSUFFICIENT_CREDITS',
            message: 'Not enough credits.',
            requiredSeconds: 240,
            purchaseUrl: 'https://stemsplit.io/app/billing',
          },
        },
        { status: 402 },
      ),
    );

    const client = new StemSplitClient(config);
    await expect(client.createJob({ sourceUrl: 'https://a.example.com/b.mp3' })).rejects.toMatchObject({
      code: 'INSUFFICIENT_CREDITS',
      httpStatus: 402,
    });
  });

  it('retries 429 responses and eventually succeeds', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    // First call: 429 with retry-after: 0 (zero delay so the test runs fast)
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(
        { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Slow down.' } },
        { status: 429, headers: { 'retry-after': '0' } },
      ),
    );
    // Second call: success
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse({
        balanceSeconds: 60,
        balanceMinutes: 1,
        balanceFormatted: '1 minute',
        updatedAt: '2026-01-01T00:00:00Z',
      }),
    );

    const client = new StemSplitClient(config);
    const balance = await client.getBalance();

    expect(balance.balanceMinutes).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it(
    'wraps network errors as NETWORK_ERROR and surfaces after retries are exhausted',
    async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('econnreset'));
      const client = new StemSplitClient(config);
      await expect(client.getBalance()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
      // GET retries up to 4 attempts total
      expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(4);
    },
    { timeout: 20_000 },
  );

  it('does not retry 5xx for POST (mutating) calls', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockFetchResponse({ error: { code: 'INTERNAL', message: 'oops' } }, { status: 500 }),
    );
    const client = new StemSplitClient(config);
    await expect(
      client.createJob({ sourceUrl: 'https://a.example.com/b.mp3' }),
    ).rejects.toMatchObject({ httpStatus: 500 });
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('builds query string for list_jobs', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockFetchResponse({ jobs: [], pagination: { total: 0, limit: 20, offset: 0, hasMore: false } }),
    );
    const client = new StemSplitClient(config);
    await client.listJobs({ limit: 5, offset: 10, status: 'COMPLETED' });
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(
      'https://stemsplit.example.com/api/v1/jobs?status=COMPLETED&limit=5&offset=10',
    );
  });

  it('encodes job IDs safely', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockFetchResponse({
        id: 'job_abc',
        status: 'COMPLETED',
        progress: 100,
        createdAt: '',
        startedAt: null,
        completedAt: null,
        input: { fileName: '', durationSeconds: 0, fileSizeBytes: 0 },
        options: { outputType: 'BOTH', quality: 'BEST', outputFormat: 'MP3' },
        outputs: null,
        creditsCharged: 0,
        errorMessage: null,
        errorDetails: null,
        expiresAt: null,
      }),
    );
    const client = new StemSplitClient(config);
    await client.getJob('job/with/slashes');
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/jobs/job%2Fwith%2Fslashes');
  });
});
