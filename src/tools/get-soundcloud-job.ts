import { z } from 'zod';

import { toJsonContent } from './shared.js';
import type { ToolDeps, ToolHandlerResult } from './shared.js';

export const getSoundcloudJobInput = {
  jobId: z.string().min(1).describe('The SoundCloud job ID returned from separate_soundcloud.'),
} as const;

const GetSoundcloudJobSchema = z.object(getSoundcloudJobInput);

export const getSoundcloudJobToolDef = {
  title: 'Get SoundCloud Job',
  description:
    'Fetch the latest state of a SoundCloud job, including fresh 1-hour presigned download URLs when COMPLETED.',
  inputSchema: getSoundcloudJobInput,
};

export async function runGetSoundcloudJob(
  rawInput: unknown,
  deps: ToolDeps,
): Promise<ToolHandlerResult> {
  const { jobId } = GetSoundcloudJobSchema.parse(rawInput);
  const job = await deps.client.getSoundcloudJob(jobId);
  return toJsonContent(job);
}
