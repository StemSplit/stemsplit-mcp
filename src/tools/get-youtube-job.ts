import { z } from 'zod';

import { toJsonContent } from './shared.js';
import type { ToolDeps, ToolHandlerResult } from './shared.js';

export const getYoutubeJobInput = {
  jobId: z.string().min(1).describe('The YouTube job ID returned from separate_youtube.'),
} as const;

const GetYoutubeJobSchema = z.object(getYoutubeJobInput);

export const getYoutubeJobToolDef = {
  title: 'Get YouTube Job',
  description:
    'Fetch the latest state of a YouTube job, including fresh 1-hour presigned download URLs when COMPLETED.',
  inputSchema: getYoutubeJobInput,
};

export async function runGetYoutubeJob(
  rawInput: unknown,
  deps: ToolDeps,
): Promise<ToolHandlerResult> {
  const { jobId } = GetYoutubeJobSchema.parse(rawInput);
  const job = await deps.client.getYoutubeJob(jobId);
  return toJsonContent(job);
}
