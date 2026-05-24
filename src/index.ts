#!/usr/bin/env node
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { StemSplitClient } from './client.js';
import { loadConfig, redactApiKey } from './config.js';
import { formatErrorForLlm } from './errors.js';
import {
  downloadStemsToolDef,
  runDownloadStems,
} from './tools/download-stems.js';
import { getBalanceToolDef, runGetBalance } from './tools/get-balance.js';
import { getJobToolDef, runGetJob } from './tools/get-job.js';
import { getSoundcloudJobToolDef, runGetSoundcloudJob } from './tools/get-soundcloud-job.js';
import { getYoutubeJobToolDef, runGetYoutubeJob } from './tools/get-youtube-job.js';
import { listJobsToolDef, runListJobs } from './tools/list-jobs.js';
import { listSoundcloudJobsToolDef, runListSoundcloudJobs } from './tools/list-soundcloud-jobs.js';
import { listYoutubeJobsToolDef, runListYoutubeJobs } from './tools/list-youtube-jobs.js';
import {
  runSeparateSoundcloud,
  separateSoundcloudToolDef,
} from './tools/separate-soundcloud.js';
import {
  runSeparateStems,
  separateStemsToolDef,
} from './tools/separate-stems.js';
import {
  runSeparateYoutube,
  separateYoutubeToolDef,
} from './tools/separate-youtube.js';
import type {
  ProgressCallback,
  ToolDeps,
  ToolHandlerResult,
} from './tools/shared.js';

type ToolHandler = (input: unknown, deps: ToolDeps) => Promise<ToolHandlerResult>;

interface ToolRegistration {
  name: string;
  def: { title: string; description: string; inputSchema: Record<string, z.ZodTypeAny> };
  handler: ToolHandler;
}

const TOOLS: ToolRegistration[] = [
  { name: 'separate_stems', def: separateStemsToolDef, handler: runSeparateStems },
  { name: 'separate_youtube', def: separateYoutubeToolDef, handler: runSeparateYoutube },
  { name: 'separate_soundcloud', def: separateSoundcloudToolDef, handler: runSeparateSoundcloud },
  { name: 'get_job', def: getJobToolDef, handler: runGetJob },
  { name: 'list_jobs', def: listJobsToolDef, handler: runListJobs },
  { name: 'get_youtube_job', def: getYoutubeJobToolDef, handler: runGetYoutubeJob },
  { name: 'list_youtube_jobs', def: listYoutubeJobsToolDef, handler: runListYoutubeJobs },
  { name: 'get_soundcloud_job', def: getSoundcloudJobToolDef, handler: runGetSoundcloudJob },
  { name: 'list_soundcloud_jobs', def: listSoundcloudJobsToolDef, handler: runListSoundcloudJobs },
  { name: 'get_balance', def: getBalanceToolDef, handler: runGetBalance },
  { name: 'download_stems', def: downloadStemsToolDef, handler: runDownloadStems },
];

function makeProgressCallback(
  extra: { sendNotification?: (n: unknown) => Promise<void> | void; _meta?: { progressToken?: string | number } },
): ProgressCallback | undefined {
  const token = extra?._meta?.progressToken;
  const send = extra?.sendNotification;
  if (token === undefined || !send) return undefined;
  return async (progress, message) => {
    try {
      await send({
        method: 'notifications/progress',
        params: {
          progressToken: token,
          progress,
          total: 100,
          message,
        },
      });
    } catch {
      // best-effort
    }
  };
}

async function wrapHandler(
  handler: ToolHandler,
  input: unknown,
  baseDeps: Omit<ToolDeps, 'onProgress'>,
  extra: Parameters<typeof makeProgressCallback>[0],
): Promise<ToolHandlerResult> {
  const onProgress = makeProgressCallback(extra);
  const deps: ToolDeps = onProgress ? { ...baseDeps, onProgress } : baseDeps;

  try {
    return await handler(input, deps);
  } catch (err) {
    const { text, data } = formatErrorForLlm(err);
    return {
      content: [{ type: 'text', text }],
      structuredContent: data,
      isError: true,
    };
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new StemSplitClient(config);

  process.stderr.write(
    `[stemsplit-mcp] starting v${config.serverVersion} (api=${config.baseUrl}, key=${redactApiKey(config.apiKey)})\n`,
  );

  const server = new McpServer(
    { name: config.serverName, version: config.serverVersion },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
        logging: {},
      },
    },
  );

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.def.title,
        description: tool.def.description,
        inputSchema: tool.def.inputSchema,
      },
      // The SDK passes (args, extra); extra carries _meta and sendNotification.
      async (args: unknown, extra: unknown) =>
        wrapHandler(
          tool.handler,
          args,
          { client, config },
          extra as Parameters<typeof makeProgressCallback>[0],
        ),
    );
  }

  server.registerResource(
    'balance',
    'stemsplit://balance',
    {
      title: 'StemSplit Credit Balance',
      description: 'Live credit balance for the configured StemSplit API key.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const balance = await client.getBalance();
      return {
        contents: [
          { uri: uri.href, mimeType: 'application/json', text: JSON.stringify(balance, null, 2) },
        ],
      };
    },
  );

  server.registerResource(
    'recent-jobs',
    'stemsplit://jobs/recent',
    {
      title: 'Recent Stem Jobs',
      description: 'The 20 most recent stem jobs for the configured API key.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const list = await client.listJobs({ limit: 20 });
      return {
        contents: [
          { uri: uri.href, mimeType: 'application/json', text: JSON.stringify(list, null, 2) },
        ],
      };
    },
  );

  server.registerResource(
    'job',
    new ResourceTemplate('stemsplit://jobs/{jobId}', { list: undefined }),
    {
      title: 'Stem Job Detail',
      description: 'Latest snapshot of a single stem job, including fresh download URLs.',
      mimeType: 'application/json',
    },
    async (uri, { jobId }) => {
      const id = Array.isArray(jobId) ? jobId[0] : jobId;
      const job = await client.getJob(id as string);
      return {
        contents: [
          { uri: uri.href, mimeType: 'application/json', text: JSON.stringify(job, null, 2) },
        ],
      };
    },
  );

  server.registerResource(
    'youtube-job',
    new ResourceTemplate('stemsplit://youtube-jobs/{jobId}', { list: undefined }),
    {
      title: 'YouTube Job Detail',
      description: 'Latest snapshot of a single YouTube job, including fresh download URLs.',
      mimeType: 'application/json',
    },
    async (uri, { jobId }) => {
      const id = Array.isArray(jobId) ? jobId[0] : jobId;
      const job = await client.getYoutubeJob(id as string);
      return {
        contents: [
          { uri: uri.href, mimeType: 'application/json', text: JSON.stringify(job, null, 2) },
        ],
      };
    },
  );

  server.registerResource(
    'soundcloud-job',
    new ResourceTemplate('stemsplit://soundcloud-jobs/{jobId}', { list: undefined }),
    {
      title: 'SoundCloud Job Detail',
      description: 'Latest snapshot of a single SoundCloud job, including fresh download URLs.',
      mimeType: 'application/json',
    },
    async (uri, { jobId }) => {
      const id = Array.isArray(jobId) ? jobId[0] : jobId;
      const job = await client.getSoundcloudJob(id as string);
      return {
        contents: [
          { uri: uri.href, mimeType: 'application/json', text: JSON.stringify(job, null, 2) },
        ],
      };
    },
  );

  server.registerPrompt(
    'karaoke',
    {
      title: 'Create a Karaoke Track',
      description:
        'Take a source audio file or direct URL and produce a karaoke (instrumental-only) version.',
      argsSchema: { source: z.string().describe('Local path or direct audio URL') },
    },
    ({ source }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Use the separate_stems tool with source="${source}" and outputType="BOTH" to produce a karaoke version. Once it completes, return the path to the instrumental file from the stems result.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'isolate_dialogue',
    {
      title: 'Isolate Dialogue / Vocals',
      description:
        'Extract just the vocals or dialogue from an audio source, removing music and background noise where the model can.',
      argsSchema: { source: z.string().describe('Local path or direct audio URL') },
    },
    ({ source }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Use separate_stems with source="${source}" and outputType="VOCALS". Return the local path to the vocals stem so I can use it for transcription or cleanup.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'sampler_pack',
    {
      title: 'Build a Six-Stem Sampler Pack',
      description: 'Split an audio file into all six stems (vocals, drums, bass, other, piano, guitar) for sampling and remixing.',
      argsSchema: { source: z.string().describe('Local path or direct audio URL') },
    },
    ({ source }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Use separate_stems with source="${source}", outputType="SIX_STEMS", quality="BEST". After it completes, list every stem and its local file path so I can load them into a sampler.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'youtube_instrumental',
    {
      title: 'Make an Instrumental from a YouTube Video',
      description: 'Submit a YouTube URL and return a local path to the instrumental (no vocals).',
      argsSchema: { youtubeUrl: z.string().describe('YouTube URL') },
    },
    ({ youtubeUrl }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Use separate_youtube with youtubeUrl="${youtubeUrl}". Return the local path to the instrumental stem once it completes.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'soundcloud_instrumental',
    {
      title: 'Make an Instrumental from a SoundCloud Track',
      description: 'Submit a SoundCloud URL and return a local path to the instrumental (no vocals).',
      argsSchema: { soundcloudUrl: z.string().describe('SoundCloud track URL') },
    },
    ({ soundcloudUrl }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Use separate_soundcloud with soundcloudUrl="${soundcloudUrl}". Return the local path to the instrumental stem once it completes.`,
          },
        },
      ],
    }),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write('[stemsplit-mcp] ready\n');
}

main().catch((err) => {
  process.stderr.write(`[stemsplit-mcp] fatal: ${(err as Error).message ?? String(err)}\n`);
  process.exit(1);
});
