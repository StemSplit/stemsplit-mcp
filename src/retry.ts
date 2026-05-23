/**
 * Retry helper with exponential backoff + jitter.
 *
 * Designed for transient network failures and server hiccups: a single
 * 502 during a 10-minute polling loop should never fail the whole job.
 *
 * The caller decides what's retryable via `shouldRetry`, which can also
 * return `{ retryAfterMs }` to override the backoff (e.g. honoring an
 * HTTP `Retry-After` header on 429s).
 */

export type RetryDecision = boolean | { retryAfterMs: number };

export interface RetryOptions {
  /** Total attempts, including the first call. Must be >= 1. */
  maxAttempts: number;
  /** Base delay before the first retry, doubled each attempt. */
  initialDelayMs: number;
  /** Hard cap on any single backoff delay. */
  maxDelayMs: number;
  /**
   * Inspect the error and return whether to retry. Receives the
   * 1-indexed attempt number that just failed. Return an object with
   * `retryAfterMs` to override the computed backoff for this attempt.
   */
  shouldRetry: (err: unknown, attempt: number) => RetryDecision;
  /** Optional hook for observability (logging, metrics). */
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBackoff(attempt: number, options: RetryOptions): number {
  const exponential = options.initialDelayMs * 2 ** (attempt - 1);
  const capped = Math.min(exponential, options.maxDelayMs);
  // Full jitter: pick a random value in [0.5*capped, 1.5*capped) so retries
  // from concurrent sessions don't synchronize.
  const jitter = 0.5 + Math.random();
  return Math.round(capped * jitter);
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  if (options.maxAttempts < 1) {
    throw new Error('withRetry: maxAttempts must be >= 1');
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === options.maxAttempts) break;

      const decision = options.shouldRetry(err, attempt);
      if (!decision) break;

      const delay =
        typeof decision === 'object' && Number.isFinite(decision.retryAfterMs)
          ? Math.max(0, Math.min(decision.retryAfterMs, options.maxDelayMs))
          : computeBackoff(attempt, options);

      options.onRetry?.(err, attempt, delay);
      await sleep(delay);
    }
  }
  throw lastError;
}
