import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import type { StemSplitClient } from './client.js';
import { expandHome } from './config.js';
import { StemSplitError } from './errors.js';
import type {
  OutputFormat,
  StemKey,
  StemOutputs,
  YoutubeJobDetailResponse,
} from './types.js';

export interface DownloadResult {
  outputDir: string;
  files: Record<string, string>;
}

const STEM_FILENAMES: Record<StemKey, string> = {
  vocals: 'vocals',
  instrumental: 'instrumental',
  drums: 'drums',
  bass: 'bass',
  other: 'other',
  piano: 'piano',
  guitar: 'guitar',
};

function extensionFor(url: string, format?: OutputFormat): string {
  if (format) return `.${format.toLowerCase()}`;
  try {
    const u = new URL(url);
    const ext = extname(u.pathname).toLowerCase();
    if (ext) return ext;
  } catch {
    // fall through
  }
  return '.mp3';
}

async function downloadOne(url: string, destPath: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (cause) {
    throw new StemSplitError(`Network error downloading stem: ${(cause as Error).message}`, {
      httpStatus: 0,
      code: 'DOWNLOAD_NETWORK_ERROR',
      endpoint: 'presigned-get',
      method: 'GET',
      destPath,
    });
  }

  if (!response.ok || !response.body) {
    throw new StemSplitError(
      `Download failed with status ${response.status} for ${destPath}.`,
      {
        httpStatus: response.status,
        code: 'DOWNLOAD_FAILED',
        endpoint: 'presigned-get',
        method: 'GET',
        destPath,
      },
    );
  }

  const reader = Readable.fromWeb(response.body as never);
  await pipeline(reader, createWriteStream(destPath));
}

export async function downloadStemOutputs(
  outputs: StemOutputs,
  outputDir: string,
  format?: OutputFormat,
): Promise<DownloadResult> {
  const resolvedDir = expandHome(outputDir);
  await mkdir(resolvedDir, { recursive: true });

  const files: Record<string, string> = {};
  for (const [stem, output] of Object.entries(outputs) as [StemKey, StemOutputs[StemKey]][]) {
    if (!output) continue;
    const fileName = `${STEM_FILENAMES[stem]}${extensionFor(output.url, format)}`;
    const destPath = join(resolvedDir, fileName);
    await downloadOne(output.url, destPath);
    files[stem] = destPath;
  }

  return { outputDir: resolvedDir, files };
}

export async function downloadYoutubeOutputs(
  outputs: NonNullable<YoutubeJobDetailResponse['outputs']>,
  outputDir: string,
): Promise<DownloadResult> {
  const resolvedDir = expandHome(outputDir);
  await mkdir(resolvedDir, { recursive: true });

  const files: Record<string, string> = {};

  if (outputs.vocals) {
    const destPath = join(resolvedDir, `vocals${extensionFor(outputs.vocals.url)}`);
    await downloadOne(outputs.vocals.url, destPath);
    files.vocals = destPath;
  }
  if (outputs.instrumental) {
    const destPath = join(resolvedDir, `instrumental${extensionFor(outputs.instrumental.url)}`);
    await downloadOne(outputs.instrumental.url, destPath);
    files.instrumental = destPath;
  }
  if (outputs.fullAudio) {
    const destPath = join(resolvedDir, `full-audio${extensionFor(outputs.fullAudio.url)}`);
    await downloadOne(outputs.fullAudio.url, destPath);
    files.fullAudio = destPath;
  }

  return { outputDir: resolvedDir, files };
}

export async function downloadStemsByJobId(
  client: StemSplitClient,
  jobId: string,
  outputDir: string,
): Promise<DownloadResult> {
  const job = await client.getJob(jobId);
  if (job.status !== 'COMPLETED' || !job.outputs) {
    throw new StemSplitError(
      `Cannot download — job ${jobId} status is ${job.status}, no outputs available.`,
      {
        httpStatus: 0,
        code: 'JOB_NOT_COMPLETED',
        endpoint: 'download',
        method: 'GET',
        jobId,
        status: job.status,
      },
    );
  }
  return downloadStemOutputs(job.outputs, outputDir, job.options.outputFormat);
}

export async function downloadYoutubeStemsByJobId(
  client: StemSplitClient,
  jobId: string,
  outputDir: string,
): Promise<DownloadResult> {
  const job = await client.getYoutubeJob(jobId);
  if (job.status !== 'COMPLETED' || !job.outputs) {
    throw new StemSplitError(
      `Cannot download — youtube job ${jobId} status is ${job.status}, no outputs available.`,
      {
        httpStatus: 0,
        code: 'JOB_NOT_COMPLETED',
        endpoint: 'download',
        method: 'GET',
        jobId,
        status: job.status,
      },
    );
  }
  return downloadYoutubeOutputs(job.outputs, outputDir);
}
