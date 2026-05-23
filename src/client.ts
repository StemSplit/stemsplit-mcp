import type { Config } from './config.js';
import { buildErrorFromResponse, StemSplitError } from './errors.js';
import { withRetry, type RetryDecision } from './retry.js';
import type {
  ApiErrorBody,
  BalanceResponse,
  StemJobCreateResponse,
  StemJobDetailResponse,
  StemJobListResponse,
  StemJobStatus,
  UploadResponse,
  YoutubeJobCreateResponse,
  YoutubeJobDetailResponse,
  YoutubeJobListResponse,
} from './types.js';

export interface CreateJobInput {
  uploadKey?: string;
  sourceUrl?: string;
  fileName?: string;
  outputType?: string;
  quality?: string;
  outputFormat?: string;
  metadata?: Record<string, unknown>;
}

interface RequestOptions {
  /**
   * Whether this call has irreversible server-side side effects. Mutating
   * calls only retry on network errors (server never saw the request);
   * non-mutating calls also retry on 5xx. Defaults to true for POST.
   */
  mutating?: boolean;
}

export function shouldRetryApiError(err: unknown, mutating: boolean): RetryDecision {
  if (!(err instanceof StemSplitError)) return false;

  // Connection-level failures (DNS, ECONNRESET, abort, timeouts). The
  // server never accepted the request, so retrying is always safe.
  if (err.code === 'NETWORK_ERROR') return true;

  // 5xx: the server received the request and may have applied side
  // effects (e.g. created a billable job) before failing. Only safe
  // to replay for idempotent calls.
  if (err.httpStatus >= 500 && err.httpStatus < 600) {
    return !mutating;
  }

  // 429: rate limited. Honor Retry-After if present, otherwise back off.
  if (err.httpStatus === 429) {
    const retryAfter = err.data.retryAfterSeconds;
    if (typeof retryAfter === 'number' && retryAfter > 0) {
      return { retryAfterMs: retryAfter * 1000 };
    }
    return true;
  }

  // 4xx other than 429: user/auth error, not transient.
  return false;
}

export class StemSplitClient {
  constructor(private readonly config: Config) {}

  private async requestOnce<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        Accept: 'application/json',
        'User-Agent': `stemsplit-mcp/${this.config.serverVersion}`,
      },
    };

    if (body !== undefined) {
      (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (cause) {
      throw new StemSplitError(
        `Network error calling ${method} ${path}: ${(cause as Error).message ?? String(cause)}`,
        { httpStatus: 0, code: 'NETWORK_ERROR', endpoint: path, method },
      );
    }

    if (!response.ok) {
      const retryAfter = response.headers.get('Retry-After');
      let errorBody: ApiErrorBody | null = null;
      try {
        errorBody = (await response.json()) as ApiErrorBody;
      } catch {
        // ignore parse failures
      }
      throw buildErrorFromResponse(path, method, response.status, errorBody, retryAfter);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    opts?: RequestOptions,
  ): Promise<T> {
    const mutating = opts?.mutating ?? method === 'POST';
    return withRetry(() => this.requestOnce<T>(method, path, body), {
      maxAttempts: mutating ? 3 : 4,
      initialDelayMs: 1000,
      maxDelayMs: 30_000,
      shouldRetry: (err) => shouldRetryApiError(err, mutating),
      onRetry: (err, attempt, delayMs) => {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(
          `[stemsplit-mcp] retry ${attempt} for ${method} ${path} in ${delayMs}ms (${message})\n`,
        );
      },
    });
  }

  async getBalance(): Promise<BalanceResponse> {
    return this.request<BalanceResponse>('GET', '/balance');
  }

  async requestUpload(filename: string, contentType?: string): Promise<UploadResponse> {
    // Creating a presigned URL has no persistent side effects, so let
    // the safe-call retry policy apply even though the method is POST.
    return this.request<UploadResponse>('POST', '/upload', { filename, contentType }, {
      mutating: false,
    });
  }

  /**
   * Streams a single body to a presigned R2 URL. Callers that want
   * automatic retry must pass a `bodyFactory` so each attempt gets a
   * fresh stream (web ReadableStreams cannot be replayed once consumed).
   */
  async uploadToPresignedUrl(
    uploadUrl: string,
    body: ReadableStream<Uint8Array> | Buffer | Blob,
    contentType: string,
    contentLength?: number,
  ): Promise<void> {
    const headers: Record<string, string> = { 'Content-Type': contentType };
    if (contentLength !== undefined) {
      headers['Content-Length'] = String(contentLength);
    }

    let response: Response;
    try {
      const init = {
        method: 'PUT',
        headers,
        body,
        duplex: 'half',
      };
      // NOTE: NO Authorization header — R2 rejects signed URLs with extra auth headers.
      // `duplex: 'half'` is required by undici when streaming a Web ReadableStream body
      // but is not yet in the standard RequestInit type, so we relax the cast here.
      response = await fetch(uploadUrl, init as unknown as RequestInit);
    } catch (cause) {
      throw new StemSplitError(
        `Network error uploading to presigned URL: ${(cause as Error).message ?? String(cause)}`,
        { httpStatus: 0, code: 'UPLOAD_NETWORK_ERROR', endpoint: 'presigned-put', method: 'PUT' },
      );
    }

    if (!response.ok) {
      let bodyText = '';
      try {
        bodyText = await response.text();
      } catch {
        // ignore
      }
      throw new StemSplitError(
        `Presigned upload failed (${response.status}): ${bodyText.slice(0, 200)}`,
        {
          httpStatus: response.status,
          code: 'UPLOAD_FAILED',
          endpoint: 'presigned-put',
          method: 'PUT',
        },
      );
    }
  }

  async createJob(input: CreateJobInput): Promise<StemJobCreateResponse> {
    return this.request<StemJobCreateResponse>('POST', '/jobs', input);
  }

  async getJob(jobId: string): Promise<StemJobDetailResponse> {
    return this.request<StemJobDetailResponse>('GET', `/jobs/${encodeURIComponent(jobId)}`);
  }

  async listJobs(params: {
    status?: StemJobStatus;
    limit?: number;
    offset?: number;
  }): Promise<StemJobListResponse> {
    const search = new URLSearchParams();
    if (params.status) search.set('status', params.status);
    if (params.limit !== undefined) search.set('limit', String(params.limit));
    if (params.offset !== undefined) search.set('offset', String(params.offset));
    const qs = search.toString();
    return this.request<StemJobListResponse>('GET', `/jobs${qs ? `?${qs}` : ''}`);
  }

  async createYoutubeJob(youtubeUrl: string): Promise<YoutubeJobCreateResponse> {
    return this.request<YoutubeJobCreateResponse>('POST', '/youtube-jobs', { youtubeUrl });
  }

  async getYoutubeJob(jobId: string): Promise<YoutubeJobDetailResponse> {
    return this.request<YoutubeJobDetailResponse>(
      'GET',
      `/youtube-jobs/${encodeURIComponent(jobId)}`,
    );
  }

  async listYoutubeJobs(params: {
    status?: StemJobStatus;
    limit?: number;
    offset?: number;
  }): Promise<YoutubeJobListResponse> {
    const search = new URLSearchParams();
    if (params.status) search.set('status', params.status);
    if (params.limit !== undefined) search.set('limit', String(params.limit));
    if (params.offset !== undefined) search.set('offset', String(params.offset));
    const qs = search.toString();
    return this.request<YoutubeJobListResponse>('GET', `/youtube-jobs${qs ? `?${qs}` : ''}`);
  }
}
