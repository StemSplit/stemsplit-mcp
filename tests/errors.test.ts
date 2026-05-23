import { describe, expect, it } from 'vitest';

import { buildErrorFromResponse, StemSplitError } from '../src/errors.js';

describe('buildErrorFromResponse', () => {
  it('maps 401 MISSING_API_KEY with helpful hint', () => {
    const err = buildErrorFromResponse(
      '/balance',
      'GET',
      401,
      { error: { code: 'MISSING_API_KEY', message: 'Missing API key.' } },
      null,
    );
    expect(err).toBeInstanceOf(StemSplitError);
    expect(err.code).toBe('MISSING_API_KEY');
    expect(err.httpStatus).toBe(401);
    expect(err.message).toMatch(/STEMSPLIT_API_KEY/);
  });

  it('maps 402 INSUFFICIENT_CREDITS with required seconds and purchase URL', () => {
    const err = buildErrorFromResponse(
      '/jobs',
      'POST',
      402,
      {
        error: {
          code: 'INSUFFICIENT_CREDITS',
          message: 'Not enough credits.',
          requiredSeconds: 240,
          purchaseUrl: 'https://stemsplit.io/app/billing',
        },
      },
      null,
    );
    expect(err.code).toBe('INSUFFICIENT_CREDITS');
    expect(err.data.requiredSeconds).toBe(240);
    expect(err.data.purchaseUrl).toBe('https://stemsplit.io/app/billing');
    expect(err.message).toMatch(/Required: 240 seconds/);
    expect(err.message).toMatch(/Purchase credits/);
  });

  it('maps 429 with Retry-After header', () => {
    const err = buildErrorFromResponse(
      '/jobs',
      'POST',
      429,
      { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded.' } },
      '12',
    );
    expect(err.data.retryAfterSeconds).toBe(12);
    expect(err.message).toMatch(/Retry after 12/);
  });

  it('maps 400 FILE_TOO_LARGE preserving extras', () => {
    const err = buildErrorFromResponse(
      '/jobs',
      'POST',
      400,
      {
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'File too large.',
          maxSizeBytes: 104857600,
          actualSizeBytes: 209715200,
        },
      },
      null,
    );
    expect(err.code).toBe('FILE_TOO_LARGE');
    expect(err.data.maxSizeBytes).toBe(104857600);
    expect(err.data.actualSizeBytes).toBe(209715200);
  });

  it('handles 500 with no body parseable', () => {
    const err = buildErrorFromResponse('/jobs', 'POST', 500, null, null);
    expect(err.httpStatus).toBe(500);
    expect(err.code).toBe('UNKNOWN');
    expect(err.message).toMatch(/StemSplit API error/);
  });

  it('falls back to message when no auth hint exists for the code', () => {
    const err = buildErrorFromResponse(
      '/balance',
      'GET',
      401,
      { error: { code: 'SOMETHING_NEW', message: 'Unknown auth issue.' } },
      null,
    );
    expect(err.message).toBe('Unknown auth issue.');
  });
});
