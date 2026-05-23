import type { Config } from './config.js';
import { buildErrorFromResponse, StemSplitError } from './errors.js';
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

export class StemSplitClient {
  constructor(private readonly config: Config) {}

  private async request<T>(
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

  async getBalance(): Promise<BalanceResponse> {
    return this.request<BalanceResponse>('GET', '/balance');
  }

  async requestUpload(filename: string, contentType?: string): Promise<UploadResponse> {
    return this.request<UploadResponse>('POST', '/upload', { filename, contentType });
  }

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
