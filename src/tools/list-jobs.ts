import { z } from 'zod';

import { optionalLimitOffset, toJsonContent } from './shared.js';
import type { ToolDeps, ToolHandlerResult } from './shared.js';

export const listJobsInput = {
  ...optionalLimitOffset,
} as const;

const ListJobsSchema = z.object(listJobsInput);

export const listJobsToolDef = {
  title: 'List Stem Jobs',
  description:
    'List the authenticated user\'s recent stem jobs, with optional status filter and pagination. Output URLs are NOT included here; use get_job for a specific job.',
  inputSchema: listJobsInput,
};

export async function runListJobs(rawInput: unknown, deps: ToolDeps): Promise<ToolHandlerResult> {
  const params = ListJobsSchema.parse(rawInput);
  const result = await deps.client.listJobs(params);
  return toJsonContent(result);
}
