import { z } from 'zod';

import { optionalLimitOffset, toJsonContent } from './shared.js';
import type { ToolDeps, ToolHandlerResult } from './shared.js';

export const listSoundcloudJobsInput = {
  ...optionalLimitOffset,
} as const;

const ListSoundcloudJobsSchema = z.object(listSoundcloudJobsInput);

export const listSoundcloudJobsToolDef = {
  title: 'List SoundCloud Jobs',
  description:
    "List the authenticated user's recent SoundCloud jobs, with optional status filter and pagination.",
  inputSchema: listSoundcloudJobsInput,
};

export async function runListSoundcloudJobs(
  rawInput: unknown,
  deps: ToolDeps,
): Promise<ToolHandlerResult> {
  const params = ListSoundcloudJobsSchema.parse(rawInput);
  const result = await deps.client.listSoundcloudJobs(params);
  return toJsonContent(result);
}
