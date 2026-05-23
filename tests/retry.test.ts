import { describe, expect, it, vi } from 'vitest';

import { shouldRetryApiError } from '../src/client.js';
import { StemSplitError } from '../src/errors.js';
import { withRetry } from '../src/retry.js';

const baseOptions = {
  maxAttempts: 3,
  initialDelayMs: 1,
  maxDelayMs: 10,
};

describe('withRetry', () => {
  it('returns immediately on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { ...baseOptions, shouldRetry: () => true });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries until success', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom1'))
      .mockRejectedValueOnce(new Error('boom2'))
      .mockResolvedValueOnce('ok');
    const result = await withRetry(fn, { ...baseOptions, shouldRetry: () => true });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('gives up after maxAttempts and throws the last error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(
      withRetry(fn, { ...baseOptions, shouldRetry: () => true }),
    ).rejects.toThrow(/boom/);
    expect(fn).toHaveBeenCalledTimes(baseOptions.maxAttempts);
  });

  it('does not retry when shouldRetry returns false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(
      withRetry(fn, { ...baseOptions, shouldRetry: () => false }),
    ).rejects.toThrow(/boom/);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('passes the attempt number to shouldRetry', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    const shouldRetry = vi.fn().mockReturnValue(true);
    await expect(withRetry(fn, { ...baseOptions, shouldRetry })).rejects.toThrow();
    expect(shouldRetry).toHaveBeenNthCalledWith(1, expect.any(Error), 1);
    expect(shouldRetry).toHaveBeenNthCalledWith(2, expect.any(Error), 2);
  });

  it('honors retryAfterMs from shouldRetry', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn().mockRejectedValueOnce(new Error('rate limit')).mockResolvedValueOnce('ok');
    await withRetry(fn, {
      maxAttempts: 2,
      initialDelayMs: 100_000,
      maxDelayMs: 100_000,
      shouldRetry: () => ({ retryAfterMs: 5 }),
      onRetry,
    });
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, 5);
  });

  it('caps overridden retryAfterMs at maxDelayMs', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn().mockRejectedValueOnce(new Error('rate limit')).mockResolvedValueOnce('ok');
    await withRetry(fn, {
      maxAttempts: 2,
      initialDelayMs: 1,
      maxDelayMs: 50,
      shouldRetry: () => ({ retryAfterMs: 10_000 }),
      onRetry,
    });
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, 50);
  });

  it('throws on maxAttempts < 1', async () => {
    await expect(
      withRetry(async () => 'x', { ...baseOptions, maxAttempts: 0, shouldRetry: () => true }),
    ).rejects.toThrow(/maxAttempts must be >= 1/);
  });
});

describe('shouldRetryApiError', () => {
  function err(httpStatus: number, code = 'X', extra: Record<string, unknown> = {}) {
    return new StemSplitError('boom', {
      httpStatus,
      code,
      endpoint: '/x',
      method: 'GET',
      ...extra,
    });
  }

  it('retries network errors for both GET and POST', () => {
    const e = err(0, 'NETWORK_ERROR');
    expect(shouldRetryApiError(e, false)).toBe(true);
    expect(shouldRetryApiError(e, true)).toBe(true);
  });

  it('retries 5xx for safe (non-mutating) calls', () => {
    expect(shouldRetryApiError(err(500), false)).toBe(true);
    expect(shouldRetryApiError(err(502), false)).toBe(true);
    expect(shouldRetryApiError(err(503), false)).toBe(true);
  });

  it('does not retry 5xx for mutating calls (avoid double-charge)', () => {
    expect(shouldRetryApiError(err(500), true)).toBe(false);
    expect(shouldRetryApiError(err(502), true)).toBe(false);
  });

  it('retries 429 with Retry-After when present', () => {
    const decision = shouldRetryApiError(err(429, 'RATE_LIMIT', { retryAfterSeconds: 3 }), true);
    expect(decision).toEqual({ retryAfterMs: 3000 });
  });

  it('retries 429 without Retry-After using backoff', () => {
    expect(shouldRetryApiError(err(429, 'RATE_LIMIT'), true)).toBe(true);
  });

  it('does not retry 4xx user errors', () => {
    expect(shouldRetryApiError(err(400), false)).toBe(false);
    expect(shouldRetryApiError(err(401), false)).toBe(false);
    expect(shouldRetryApiError(err(402, 'INSUFFICIENT_CREDITS'), false)).toBe(false);
    expect(shouldRetryApiError(err(403), false)).toBe(false);
    expect(shouldRetryApiError(err(404), false)).toBe(false);
    expect(shouldRetryApiError(err(422), false)).toBe(false);
  });

  it('does not retry non-StemSplit errors', () => {
    expect(shouldRetryApiError(new Error('oops'), false)).toBe(false);
    expect(shouldRetryApiError('string', false)).toBe(false);
    expect(shouldRetryApiError(null, false)).toBe(false);
  });
});
