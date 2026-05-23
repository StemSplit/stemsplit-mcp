import type { ApiErrorBody } from './types.js';

export interface StemSplitErrorData {
  httpStatus: number;
  code: string;
  endpoint: string;
  method: string;
  retryAfterSeconds?: number;
  [key: string]: unknown;
}

export class StemSplitError extends Error {
  public readonly httpStatus: number;
  public readonly code: string;
  public readonly data: StemSplitErrorData;

  constructor(message: string, data: StemSplitErrorData) {
    super(message);
    this.name = 'StemSplitError';
    this.httpStatus = data.httpStatus;
    this.code = data.code;
    this.data = data;
  }
}

const AUTH_HINTS: Record<string, string> = {
  MISSING_API_KEY:
    'Set STEMSPLIT_API_KEY in your MCP client config (e.g. Claude Desktop or Cursor mcp.json).',
  INVALID_API_KEY_FORMAT:
    'STEMSPLIT_API_KEY must start with "sk_live_". Generate a new key at https://stemsplit.io/app/settings/api.',
  INVALID_API_KEY:
    'The API key was not recognized. Generate a fresh one at https://stemsplit.io/app/settings/api.',
  API_KEY_REVOKED: 'This API key has been revoked. Create a new one in your dashboard.',
  API_KEY_EXPIRED: 'This API key has expired. Create a new one in your dashboard.',
  EMAIL_NOT_VERIFIED:
    'Verify your StemSplit account email before using the API.',
  ACCOUNT_SUSPENDED: 'This account is suspended. Contact support@stemsplit.io.',
};

export function buildErrorFromResponse(
  endpoint: string,
  method: string,
  httpStatus: number,
  body: ApiErrorBody | null,
  retryAfterHeader: string | null,
): StemSplitError {
  const errorObj = body?.error ?? { code: 'UNKNOWN', message: `HTTP ${httpStatus}` };
  const { code, message, ...extras } = errorObj;

  const data: StemSplitErrorData = {
    httpStatus,
    code,
    endpoint,
    method,
    ...extras,
  };

  let displayMessage = message;

  if (httpStatus === 401 || httpStatus === 403) {
    const hint = AUTH_HINTS[code];
    if (hint) displayMessage = `${message} ${hint}`;
  }

  if (httpStatus === 402 && code === 'INSUFFICIENT_CREDITS') {
    const required =
      typeof extras.requiredSeconds === 'number' ? extras.requiredSeconds : undefined;
    const purchaseUrl = typeof extras.purchaseUrl === 'string' ? extras.purchaseUrl : undefined;
    const parts = [message];
    if (required !== undefined) parts.push(`Required: ${required} seconds.`);
    if (purchaseUrl) parts.push(`Purchase credits: ${purchaseUrl}`);
    displayMessage = parts.join(' ');
  }

  if (httpStatus === 429) {
    const parsed = retryAfterHeader ? Number(retryAfterHeader) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      data.retryAfterSeconds = parsed;
      displayMessage = `${message} Retry after ${parsed} seconds.`;
    }
  }

  if (httpStatus >= 500) {
    displayMessage = `StemSplit API error: ${message}`;
  }

  return new StemSplitError(displayMessage, data);
}

export function formatErrorForLlm(err: unknown): {
  text: string;
  data: Record<string, unknown> | undefined;
} {
  if (err instanceof StemSplitError) {
    return {
      text: `[${err.code}] ${err.message}`,
      data: err.data,
    };
  }
  if (err instanceof Error) {
    return { text: err.message, data: undefined };
  }
  return { text: String(err), data: undefined };
}
