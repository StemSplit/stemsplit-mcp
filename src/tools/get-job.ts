import { z } from 'zod';

import { toJsonContent } from './shared.js';
import type { ToolDeps, ToolHandlerResult } from './shared.js';

export const getJobInput = {
  jobId: z.string().min(1).describe('The stem-job ID returned from separate_stems.'),
} as const;

const GetJobSchema = z.object(getJobInput);

export const getJobToolDef = {
  title: 'Get Stem Job',
  description:
    'Fetch the latest state of a stem job, including fresh 1-hour presigned download URLs when COMPLETED. Use for jobs created via separate_stems.',
  inputSchema: getJobInput,
};

export async function runGetJob(rawInput: unknown, deps: ToolDeps): Promise<ToolHandlerResult> {
  const { jobId } = GetJobSchema.parse(rawInput);
  const job = await deps.client.getJob(jobId);
  return toJsonContent(job);
}
