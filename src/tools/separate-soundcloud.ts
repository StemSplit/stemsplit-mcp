import { z } from 'zod';

import { downloadYoutubeOutputs } from '../download.js';
import { assertJobCompleted, pollSoundcloudJob } from '../poll.js';
import { defaultJobOutputDir, toJsonContent } from './shared.js';
import type { ToolDeps, ToolHandlerResult } from './shared.js';

export const separateSoundcloudInput = {
  soundcloudUrl: z
    .string()
    .min(1)
    .describe(
      'A SoundCloud track URL — soundcloud.com/artist/track, m.soundcloud.com/artist/track, or on.soundcloud.com/shortcode.',
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

const SeparateSoundcloudSchema = z.object(separateSoundcloudInput);

export const separateSoundcloudToolDef = {
  title: 'Separate Stems from SoundCloud',
  description:
    'Submit a SoundCloud track URL to StemSplit. The server fetches the track, separates it into vocals and instrumental (MP3, BEST quality), and returns local file paths once complete. Use this for any soundcloud.com URL.',
  inputSchema: separateSoundcloudInput,
};

export async function runSeparateSoundcloud(
  rawInput: unknown,
  deps: ToolDeps,
): Promise<ToolHandlerResult> {
  const input = SeparateSoundcloudSchema.parse(rawInput);

  const created = await deps.client.createSoundcloudJob(input.soundcloudUrl);

  if (!input.wait) {
    return toJsonContent({
      jobId: created.id,
      status: created.status,
      trackId: created.trackId,
      trackTitle: created.trackTitle,
      trackDuration: created.trackDuration,
      trackDurationEstimated: created.trackDurationEstimated,
      artistName: created.artistName,
      creditsRequired: created.creditsRequired,
      note: created.note,
      message: `SoundCloud job submitted. Call get_soundcloud_job with jobId="${created.id}" to check status.`,
    });
  }

  const completed = await pollSoundcloudJob(deps.client, created.id, {
    timeoutSeconds: input.timeoutSeconds,
    pollIntervalSeconds: input.pollIntervalSeconds,
    onProgress: deps.onProgress
      ? async (p, s) => {
          await deps.onProgress?.(p, `SoundCloud job ${created.id}: ${s} (${p}%)`);
        }
      : undefined,
  });

  assertJobCompleted({
    id: completed.id,
    status: completed.status,
    errorMessage: completed.errorMessage ?? null,
  });

  if (!completed.outputs) {
    throw new Error(
      `SoundCloud job ${completed.id} reported COMPLETED but returned no outputs.`,
    );
  }

  const outputDir = input.outputDir ?? defaultJobOutputDir(deps.config, completed.id);
  const downloaded = await downloadYoutubeOutputs(completed.outputs, outputDir);

  return toJsonContent({
    jobId: completed.id,
    status: completed.status,
    soundcloudUrl: completed.soundcloudUrl,
    trackId: completed.trackId,
    trackTitle: completed.trackTitle,
    trackDuration: completed.trackDuration,
    artistName: completed.artistName,
    creditsCharged: completed.creditsCharged,
    completedAt: completed.completedAt,
    outputDir: downloaded.outputDir,
    stems: downloaded.files,
  });
}
