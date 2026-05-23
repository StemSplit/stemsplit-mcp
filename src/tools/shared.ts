import { isAbsolute, join } from 'node:path';
import { z } from 'zod';

import type { StemSplitClient } from '../client.js';
import type { Config } from '../config.js';
import { OUTPUT_FORMATS, OUTPUT_TYPES, QUALITIES, STEM_JOB_STATUSES } from '../types.js';
import type { OutputFormat, OutputType, Quality, StemJobStatus } from '../types.js';

export interface ToolDeps {
  client: StemSplitClient;
  config: Config;
  onProgress?: ProgressCallback;
}

export type ProgressCallback = (progress: number, message: string) => void | Promise<void>;

export interface ToolHandlerResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  [key: string]: unknown;
}

export const statusEnum = z.enum(STEM_JOB_STATUSES);
export const outputTypeEnum = z.enum(OUTPUT_TYPES);
export const qualityEnum = z.enum(QUALITIES);
export const outputFormatEnum = z.enum(OUTPUT_FORMATS);

export const optionalLimitOffset = {
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  status: statusEnum.optional(),
} as const;

export interface SourceClassification {
  kind: 'url' | 'local';
  value: string;
}

const YOUTUBE_HOST_PATTERN =
  /(?:^|\.)(?:youtube\.com|youtu\.be|youtube-nocookie\.com|m\.youtube\.com)$/i;

function isTildeHome(path: string): boolean {
  return path === '~' || path.startsWith('~/');
}

export function classifySource(source: string): SourceClassification {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new Error('source is empty');
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new Error(`Invalid URL: ${trimmed}`);
    }
    if (YOUTUBE_HOST_PATTERN.test(url.hostname)) {
      throw new Error(
        'YouTube URLs are not accepted by separate_stems. Use the separate_youtube tool instead.',
      );
    }
    return { kind: 'url', value: trimmed };
  }

  // file:// URIs aren't supported because R2 presigned uploads need the
  // raw file bytes from disk, not a URL fetch. Surface this clearly.
  if (trimmed.startsWith('file://')) {
    throw new Error(
      'file:// URIs are not supported. Pass the absolute filesystem path instead (e.g. /Users/you/Music/song.mp3).',
    );
  }

  // Local path: require absolute or tilde-anchored to home so relative
  // paths don't silently resolve against the MCP server's cwd (which
  // for Claude Desktop / Cursor is usually a system root the LLM has
  // no way to know about). A clear error here is much friendlier than
  // a downstream "File not found: /song.mp3".
  if (!isTildeHome(trimmed) && !isAbsolute(trimmed)) {
    throw new Error(
      `Relative paths are not supported (got "${trimmed}"). ` +
        `Pass an absolute path like "/Users/you/Music/song.mp3" or a home-anchored path like "~/Music/song.mp3". ` +
        `If you do not know the absolute path, ask the user for it before retrying.`,
    );
  }

  return { kind: 'local', value: trimmed };
}

export function defaultJobOutputDir(config: Config, jobId: string): string {
  return join(config.defaultOutputDir, jobId);
}

export function toJsonContent(value: unknown): ToolHandlerResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>,
  };
}

export function validateOptions(options: {
  outputType?: OutputType;
  quality?: Quality;
  outputFormat?: OutputFormat;
}): void {
  if (options.outputType === 'SIX_STEMS' && options.quality && options.quality !== 'BEST') {
    throw new Error('outputType=SIX_STEMS requires quality=BEST.');
  }
}

export type StatusEnumType = StemJobStatus;
