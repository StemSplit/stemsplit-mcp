import { z } from 'zod';

import { downloadStemsByJobId, downloadYoutubeStemsByJobId } from '../download.js';
import { defaultJobOutputDir, toJsonContent } from './shared.js';
import type { ToolDeps, ToolHandlerResult } from './shared.js';

export const downloadStemsInput = {
  jobId: z.string().min(1).describe('The job ID to download outputs for.'),
  kind: z
    .enum(['stem', 'youtube'])
    .optional()
    .default('stem')
    .describe('Whether this is a stem job (default) or a YouTube job.'),
  outputDir: z
    .string()
    .optional()
    .describe('Directory to write outputs into. Defaults to ~/Downloads/stemsplit/<jobId>/.'),
} as const;

const DownloadStemsSchema = z.object(downloadStemsInput);

export const downloadStemsToolDef = {
  title: 'Download Stem Outputs',
  description:
    'Download the output stems of a COMPLETED job to a local directory. Presigned URLs are re-fetched fresh on every call so the 1-hour expiry is never a problem.',
  inputSchema: downloadStemsInput,
};

export async function runDownloadStems(
  rawInput: unknown,
  deps: ToolDeps,
): Promise<ToolHandlerResult> {
  const input = DownloadStemsSchema.parse(rawInput);
  const outputDir = input.outputDir ?? defaultJobOutputDir(deps.config, input.jobId);

  const result =
    input.kind === 'youtube'
      ? await downloadYoutubeStemsByJobId(deps.client, input.jobId, outputDir)
      : await downloadStemsByJobId(deps.client, input.jobId, outputDir);

  return toJsonContent({
    jobId: input.jobId,
    kind: input.kind,
    outputDir: result.outputDir,
    files: result.files,
  });
}
