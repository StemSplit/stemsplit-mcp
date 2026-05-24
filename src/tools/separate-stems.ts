import { z } from 'zod';

import { downloadStemOutputs } from '../download.js';
import { assertJobCompleted, pollStemJob } from '../poll.js';
import { uploadLocalFile } from '../upload.js';
import {
  classifySource,
  defaultJobOutputDir,
  outputFormatEnum,
  outputTypeEnum,
  qualityEnum,
  toJsonContent,
  validateOptions,
} from './shared.js';
import type { ToolDeps, ToolHandlerResult } from './shared.js';

export const separateStemsInput = {
  source: z
    .string()
    .min(1)
    .describe(
      'Local absolute path (e.g. /Users/me/song.mp3 or ~/Music/song.wav) or direct audio URL (https://...). Do NOT pass YouTube or SoundCloud URLs here — use separate_youtube for YouTube, separate_soundcloud for SoundCloud.',
    ),
  outputType: outputTypeEnum
    .optional()
    .default('BOTH')
    .describe(
      'Which stems to extract. VOCALS, INSTRUMENTAL, BOTH (default), FOUR_STEMS (vocals+drums+bass+other), SIX_STEMS (adds piano+guitar — requires quality=BEST).',
    ),
  quality: qualityEnum
    .optional()
    .default('BEST')
    .describe('Processing quality. FAST, BALANCED, or BEST (default).'),
  outputFormat: outputFormatEnum
    .optional()
    .default('MP3')
    .describe('Output file format. MP3 (default), WAV, or FLAC.'),
  fileName: z
    .string()
    .optional()
    .describe('Optional display name for the job (defaults to the source filename).'),
  wait: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      'If true (default), block until the job completes and download stems to disk. If false, return job_id immediately and let the caller poll get_job.',
    ),
  timeoutSeconds: z
    .number()
    .int()
    .min(10)
    .max(3600)
    .optional()
    .default(600)
    .describe('Maximum time to wait for completion when wait=true. Default 600s (10 minutes).'),
  pollIntervalSeconds: z
    .number()
    .int()
    .min(1)
    .max(60)
    .optional()
    .default(5)
    .describe('How often to check job status when wait=true. Default 5s.'),
  outputDir: z
    .string()
    .optional()
    .describe(
      'Directory to write stems into when wait=true. Defaults to ~/Downloads/stemsplit/<jobId>/.',
    ),
} as const;

const SeparateStemsSchema = z.object(separateStemsInput);

export const separateStemsToolDef = {
  title: 'Separate Stems',
  description:
    'Submit an audio file or direct audio URL to StemSplit for stem separation. By default (wait=true), this polls until completion and downloads all output stems to disk, returning local file paths the LLM can hand off to other tools. For YouTube URLs, use separate_youtube instead.',
  inputSchema: separateStemsInput,
};

export async function runSeparateStems(
  rawInput: unknown,
  deps: ToolDeps,
): Promise<ToolHandlerResult> {
  const input = SeparateStemsSchema.parse(rawInput);

  validateOptions({
    outputType: input.outputType,
    quality: input.quality,
    outputFormat: input.outputFormat,
  });

  const classified = classifySource(input.source);

  const jobPayload: Record<string, unknown> = {
    outputType: input.outputType,
    quality: input.quality,
    outputFormat: input.outputFormat,
  };
  if (input.fileName) jobPayload.fileName = input.fileName;

  if (classified.kind === 'local') {
    const upload = await uploadLocalFile(deps.client, classified.value);
    jobPayload.uploadKey = upload.uploadKey;
    if (!input.fileName) jobPayload.fileName = upload.fileName;
  } else {
    jobPayload.sourceUrl = classified.value;
  }

  const created = await deps.client.createJob(jobPayload);

  if (!input.wait) {
    return toJsonContent({
      jobId: created.id,
      status: created.status,
      progress: created.progress,
      creditsRequired: created.creditsRequired,
      estimatedSeconds: created.estimatedSeconds,
      input: created.input,
      options: created.options,
      message: `Job submitted. Call get_job with jobId="${created.id}" to check status, or download_stems once status=COMPLETED.`,
    });
  }

  const completed = await pollStemJob(deps.client, created.id, {
    timeoutSeconds: input.timeoutSeconds,
    pollIntervalSeconds: input.pollIntervalSeconds,
    onProgress: deps.onProgress
      ? async (p, s) => {
          await deps.onProgress?.(p, `Job ${created.id}: ${s} (${p}%)`);
        }
      : undefined,
  });

  assertJobCompleted(completed);

  if (!completed.outputs) {
    throw new Error(`Job ${completed.id} reported COMPLETED but returned no outputs.`);
  }

  const outputDir = input.outputDir ?? defaultJobOutputDir(deps.config, completed.id);
  const downloaded = await downloadStemOutputs(
    completed.outputs,
    outputDir,
    completed.options.outputFormat,
  );

  return toJsonContent({
    jobId: completed.id,
    status: completed.status,
    progress: completed.progress,
    creditsCharged: completed.creditsCharged,
    completedAt: completed.completedAt,
    input: completed.input,
    options: completed.options,
    outputDir: downloaded.outputDir,
    stems: downloaded.files,
  });
}
