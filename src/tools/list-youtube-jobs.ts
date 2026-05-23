import { z } from 'zod';

import { optionalLimitOffset, toJsonContent } from './shared.js';
import type { ToolDeps, ToolHandlerResult } from './shared.js';

export const listYoutubeJobsInput = {
  ...optionalLimitOffset,
} as const;

const ListYoutubeJobsSchema = z.object(listYoutubeJobsInput);

export const listYoutubeJobsToolDef = {
  title: 'List YouTube Jobs',
  description:
    'List the authenticated user\'s recent YouTube jobs, with optional status filter and pagination.',
  inputSchema: listYoutubeJobsInput,
};

export async function runListYoutubeJobs(
  rawInput: unknown,
  deps: ToolDeps,
): Promise<ToolHandlerResult> {
  const params = ListYoutubeJobsSchema.parse(rawInput);
  const result = await deps.client.listYoutubeJobs(params);
  return toJsonContent(result);
}
