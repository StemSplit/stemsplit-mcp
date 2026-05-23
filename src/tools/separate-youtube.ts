import { z } from 'zod';

import { downloadYoutubeOutputs } from '../download.js';
import { assertJobCompleted, pollYoutubeJob } from '../poll.js';
import { defaultJobOutputDir, toJsonContent } from './shared.js';
import type { ToolDeps, ToolHandlerResult } from './shared.js';

export const separateYoutubeInput = {
  youtubeUrl: z
    .string()
    .min(1)
    .describe(
      'A YouTube URL — youtube.com/watch?v=, youtu.be/, embed, or a bare 11-character video ID.',
    ),
  wait: z
    .boolean()
    .optional()
    .default(true)
    .describe('If true (default), poll until completion and download outputs to disk.'),
  timeoutSeconds: z.number().int().min(10).max(3600).optional().default(900),
  pollIntervalSeconds: z.number().int().min(1).max(60).optional().default(5),
  outputDir: z
    .string()
    .optional()
    .describe(
      'Directory to write outputs into. Defaults to ~/Downloads/stemsplit/<jobId>/. Output is fixed to vocals + instrumental, MP3, BEST quality.',
    ),
} as const;

const SeparateYoutubeSchema = z.object(separateYoutubeInput);

export const separateYoutubeToolDef = {
  title: 'Separate Stems from YouTube',
  description:
    'Submit a YouTube URL to StemSplit. The server fetches the video, separates it into vocals and instrumental (MP3, BEST quality), and returns local file paths once complete. Use this for any youtube.com or youtu.be URL.',
  inputSchema: separateYoutubeInput,
};

export async function runSeparateYoutube(
  rawInput: unknown,
  deps: ToolDeps,
): Promise<ToolHandlerResult> {
  const input = SeparateYoutubeSchema.parse(rawInput);

  const created = await deps.client.createYoutubeJob(input.youtubeUrl);

  if (!input.wait) {
    return toJsonContent({
      jobId: created.id,
      status: created.status,
      videoId: created.videoId,
      videoTitle: created.videoTitle,
      videoDuration: created.videoDuration,
      channelName: created.channelName,
      creditsRequired: created.creditsRequired,
      message: `YouTube job submitted. Call get_youtube_job with jobId="${created.id}" to check status.`,
    });
  }

  const completed = await pollYoutubeJob(deps.client, created.id, {
    timeoutSeconds: input.timeoutSeconds,
    pollIntervalSeconds: input.pollIntervalSeconds,
    onProgress: deps.onProgress
      ? async (p, s) => {
          await deps.onProgress?.(p, `YouTube job ${created.id}: ${s} (${p}%)`);
        }
      : undefined,
  });

  assertJobCompleted({
    id: completed.id,
    status: completed.status,
    errorMessage: completed.errorMessage ?? null,
  });

  if (!completed.outputs) {
    throw new Error(`YouTube job ${completed.id} reported COMPLETED but returned no outputs.`);
  }

  const outputDir = input.outputDir ?? defaultJobOutputDir(deps.config, completed.id);
  const downloaded = await downloadYoutubeOutputs(completed.outputs, outputDir);

  return toJsonContent({
    jobId: completed.id,
    status: completed.status,
    videoId: completed.videoId,
    videoTitle: completed.videoTitle,
    videoDuration: completed.videoDuration,
    channelName: completed.channelName,
    creditsCharged: completed.creditsCharged,
    completedAt: completed.completedAt,
    outputDir: downloaded.outputDir,
    stems: downloaded.files,
  });
}
