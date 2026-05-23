import { describe, expect, it } from 'vitest';

import { expandHome, loadConfig, redactApiKey } from '../src/config.js';

describe('loadConfig', () => {
  it('throws when STEMSPLIT_API_KEY is missing', () => {
    expect(() => loadConfig({})).toThrow(/STEMSPLIT_API_KEY is required/);
  });

  it('throws when STEMSPLIT_API_KEY has wrong prefix', () => {
    expect(() => loadConfig({ STEMSPLIT_API_KEY: 'bad_key_format' })).toThrow(/sk_live_/);
  });

  it('loads defaults when only API key is set', () => {
    const cfg = loadConfig({ STEMSPLIT_API_KEY: 'sk_live_abc123' });
    expect(cfg.apiKey).toBe('sk_live_abc123');
    expect(cfg.baseUrl).toBe('https://stemsplit.io/api/v1');
    expect(cfg.serverName).toBe('stemsplit-mcp');
    expect(cfg.defaultOutputDir).toMatch(/stemsplit$/);
  });

  it('strips trailing slash from base URL override', () => {
    const cfg = loadConfig({
      STEMSPLIT_API_KEY: 'sk_live_abc',
      STEMSPLIT_API_BASE_URL: 'https://example.com/api/v1/',
    });
    expect(cfg.baseUrl).toBe('https://example.com/api/v1');
  });

  it('expands ~ in default output dir override', () => {
    const cfg = loadConfig({
      STEMSPLIT_API_KEY: 'sk_live_abc',
      STEMSPLIT_DEFAULT_OUTPUT_DIR: '~/stem-outputs',
    });
    expect(cfg.defaultOutputDir).toMatch(/\/stem-outputs$/);
    expect(cfg.defaultOutputDir.startsWith('~')).toBe(false);
  });
});

describe('expandHome', () => {
  it('expands ~/ prefix', () => {
    const expanded = expandHome('~/foo/bar');
    expect(expanded.startsWith('~')).toBe(false);
    expect(expanded.endsWith('/foo/bar')).toBe(true);
  });

  it('returns absolute paths unchanged', () => {
    expect(expandHome('/tmp/foo')).toBe('/tmp/foo');
  });

  it('resolves relative paths', () => {
    const expanded = expandHome('foo');
    expect(expanded.startsWith('/')).toBe(true);
  });
});

describe('redactApiKey', () => {
  it('keeps prefix and masks the rest', () => {
    expect(redactApiKey('sk_live_abcdef123456')).toBe('sk_live_abc***');
  });

  it('handles short keys safely', () => {
    expect(redactApiKey('short')).toBe('sk_live_***');
  });
});
