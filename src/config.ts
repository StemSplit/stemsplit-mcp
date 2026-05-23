import { homedir } from 'node:os';
import { join, isAbsolute, resolve } from 'node:path';

export interface Config {
  apiKey: string;
  baseUrl: string;
  defaultOutputDir: string;
  serverName: string;
  serverVersion: string;
}

const DEFAULT_BASE_URL = 'https://stemsplit.io/api/v1';
const DEFAULT_OUTPUT_SUBDIR = 'stemsplit';

export function expandHome(path: string): string {
  if (path.startsWith('~/')) {
    return join(homedir(), path.slice(2));
  }
  if (path === '~') {
    return homedir();
  }
  return isAbsolute(path) ? path : resolve(path);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiKey = env.STEMSPLIT_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'STEMSPLIT_API_KEY is required. Generate one at https://stemsplit.io/app/settings/api and add it to your MCP client config.',
    );
  }
  if (!apiKey.startsWith('sk_live_')) {
    throw new Error(
      'STEMSPLIT_API_KEY must start with "sk_live_". You can generate a fresh key at https://stemsplit.io/app/settings/api.',
    );
  }

  const baseUrl = (env.STEMSPLIT_API_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, '');

  const rawOutputDir = env.STEMSPLIT_DEFAULT_OUTPUT_DIR?.trim();
  const defaultOutputDir = rawOutputDir
    ? expandHome(rawOutputDir)
    : join(homedir(), 'Downloads', DEFAULT_OUTPUT_SUBDIR);

  return {
    apiKey,
    baseUrl,
    defaultOutputDir,
    serverName: 'stemsplit-mcp',
    serverVersion: '0.2.0',
  };
}

export function redactApiKey(key: string): string {
  if (key.length <= 12) return 'sk_live_***';
  return `${key.slice(0, 11)}***`;
}
