import { describe, expect, it, vi } from 'vitest';

import { assertJobCompleted, pollStemJob } from '../src/poll.js';
import { StemSplitError } from '../src/errors.js';
import type { StemSplitClient } from '../src/client.js';
import type { StemJobDetailResponse } from '../src/types.js';

function makeJob(overrides: Partial<StemJobDetailResponse>): StemJobDetailResponse {
  return {
    id: 'job_test',
    status: 'PENDING',
    progress: 0,
    createdAt: '2026-01-01T00:00:00Z',
    startedAt: null,
    completedAt: null,
    input: { fileName: 'song.mp3', durationSeconds: 60, fileSizeBytes: 1024 },
    options: { outputType: 'BOTH', quality: 'BEST', outputFormat: 'MP3' },
    outputs: null,
    creditsCharged: 0,
    errorMessage: null,
    errorDetails: null,
    expiresAt: null,
    ...overrides,
  };
}

function mockClient(sequence: StemJobDetailResponse[]): StemSplitClient {
  let i = 0;
  return {
    getJob: vi.fn(async () => sequence[Math.min(i++, sequence.length - 1)]),
  } as unknown as StemSplitClient;
}

describe('pollStemJob', () => {
  it('returns immediately when the first response is COMPLETED', async () => {
    const client = mockClient([
      makeJob({ status: 'COMPLETED', progress: 100, completedAt: '2026-01-01T00:01:00Z' }),
    ]);
    const result = await pollStemJob(client, 'job_test', {
      timeoutSeconds: 5,
      pollIntervalSeconds: 1,
    });
    expect(result.status).toBe('COMPLETED');
  });

  it('polls multiple times until terminal status', async () => {
    const client = mockClient([
      makeJob({ status: 'PENDING', progress: 0 }),
      makeJob({ status: 'PROCESSING', progress: 50 }),
      makeJob({ status: 'COMPLETED', progress: 100 }),
    ]);
    const result = await pollStemJob(client, 'job_test', {
      timeoutSeconds: 5,
      pollIntervalSeconds: 0,
    });
    expect(result.status).toBe('COMPLETED');
    expect(client.getJob).toHaveBeenCalledTimes(3);
  });

  it('invokes onProgress for each tick', async () => {
    const onProgress = vi.fn();
    const client = mockClient([
      makeJob({ status: 'PROCESSING', progress: 30 }),
      makeJob({ status: 'COMPLETED', progress: 100 }),
    ]);
    await pollStemJob(client, 'job_test', {
      timeoutSeconds: 5,
      pollIntervalSeconds: 0,
      onProgress,
    });
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, 30, 'PROCESSING');
    expect(onProgress).toHaveBeenNthCalledWith(2, 100, 'COMPLETED');
  });

  it('throws POLL_TIMEOUT when timeout elapses', async () => {
    const client = mockClient([makeJob({ status: 'PROCESSING', progress: 10 })]);
    await expect(
      pollStemJob(client, 'job_test', { timeoutSeconds: 0, pollIntervalSeconds: 0 }),
    ).rejects.toMatchObject({ code: 'POLL_TIMEOUT' });
  });
});

describe('assertJobCompleted', () => {
  it('passes for COMPLETED', () => {
    expect(() => assertJobCompleted({ id: 'a', status: 'COMPLETED' })).not.toThrow();
  });

  it('throws JOB_FAILED for FAILED with error message', () => {
    expect(() =>
      assertJobCompleted({ id: 'a', status: 'FAILED', errorMessage: 'bad audio' }),
    ).toThrow(StemSplitError);
  });

  it('throws JOB_EXPIRED for EXPIRED', () => {
    try {
      assertJobCompleted({ id: 'a', status: 'EXPIRED' });
      throw new Error('expected to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(StemSplitError);
      expect((err as StemSplitError).code).toBe('JOB_EXPIRED');
    }
  });
});
