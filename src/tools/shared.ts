import { join } from 'node:path';
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
