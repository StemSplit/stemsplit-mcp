import type { StemSplitClient } from './client.js';
import { StemSplitError } from './errors.js';
import type { SoundcloudJobDetailResponse, StemJobDetailResponse, YoutubeJobDetailResponse } from './types.js';
import { isTerminalStatus } from './types.js';

export interface PollOptions {
  timeoutSeconds: number;
  pollIntervalSeconds: number;
  onProgress?: (progress: number, status: string) => void | Promise<void>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollUntilTerminal<T extends { id: string; status: string; progress: number }>(
  fetcher: () => Promise<T>,
  jobId: string,
  options: PollOptions,
): Promise<T> {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutSeconds * 1000;
  const intervalMs = options.pollIntervalSeconds * 1000;

  while (true) {
    const job = await fetcher();

    if (options.onProgress) {
      try {
        await options.onProgress(job.progress ?? 0, job.status);
      } catch {
        // do not let progress callback failures abort the poll
      }
    }

    if (isTerminalStatus(job.status as never)) {
      return job;
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed + intervalMs > timeoutMs) {
      throw new StemSplitError(
        `Timed out after ${options.timeoutSeconds}s waiting for job ${jobId}. ` +
          `Use get_job with jobId="${jobId}" to check status later.`,
        {
          httpStatus: 0,
          code: 'POLL_TIMEOUT',
          endpoint: 'poll',
          method: 'GET',
          jobId,
          elapsedSeconds: Math.round(elapsed / 1000),
          timeoutSeconds: options.timeoutSeconds,
        },
      );
    }

    await sleep(intervalMs);
  }
}

export async function pollStemJob(
  client: StemSplitClient,
  jobId: string,
  options: PollOptions,
): Promise<StemJobDetailResponse> {
  return pollUntilTerminal(() => client.getJob(jobId), jobId, options);
}

export async function pollYoutubeJob(
  client: StemSplitClient,
  jobId: string,
  options: PollOptions,
): Promise<YoutubeJobDetailResponse> {
  return pollUntilTerminal(() => client.getYoutubeJob(jobId), jobId, options);
}

export async function pollSoundcloudJob(
  client: StemSplitClient,
  jobId: string,
  options: PollOptions,
): Promise<SoundcloudJobDetailResponse> {
  return pollUntilTerminal(() => client.getSoundcloudJob(jobId), jobId, options);
}

export function assertJobCompleted(job: {
  id: string;
  status: string;
  errorMessage?: string | null;
}): void {
  if (job.status === 'COMPLETED') return;
  if (job.status === 'FAILED') {
    throw new StemSplitError(
      `Job ${job.id} failed: ${job.errorMessage ?? 'Unknown error.'}`,
      {
        httpStatus: 0,
        code: 'JOB_FAILED',
        endpoint: 'poll',
        method: 'GET',
        jobId: job.id,
        errorMessage: job.errorMessage ?? null,
      },
    );
  }
  if (job.status === 'EXPIRED') {
    throw new StemSplitError(`Job ${job.id} has expired.`, {
      httpStatus: 0,
      code: 'JOB_EXPIRED',
      endpoint: 'poll',
      method: 'GET',
      jobId: job.id,
    });
  }
  throw new StemSplitError(`Job ${job.id} ended in unexpected status: ${job.status}`, {
    httpStatus: 0,
    code: 'JOB_UNEXPECTED_STATUS',
    endpoint: 'poll',
    method: 'GET',
    jobId: job.id,
    status: job.status,
  });
}
