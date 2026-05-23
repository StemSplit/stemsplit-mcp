import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { Readable } from 'node:stream';

import type { StemSplitClient } from './client.js';
import { expandHome } from './config.js';
import { StemSplitError } from './errors.js';
import {
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  SUPPORTED_INPUT_EXTENSIONS,
} from './types.js';
import type { InputExtension } from './types.js';

const MIME_BY_EXT: Record<InputExtension, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  webm: 'audio/webm',
  aac: 'audio/aac',
  wma: 'audio/x-ms-wma',
};

export interface PreparedUpload {
  uploadKey: string;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
}

export async function uploadLocalFile(
  client: StemSplitClient,
  localPath: string,
): Promise<PreparedUpload> {
  const absolutePath = expandHome(localPath);

  let stats: Awaited<ReturnType<typeof stat>>;
  try {
    stats = await stat(absolutePath);
  } catch (cause) {
    throw new StemSplitError(`File not found: ${absolutePath}`, {
      httpStatus: 0,
      code: 'LOCAL_FILE_NOT_FOUND',
      endpoint: 'local-fs',
      method: 'stat',
      path: absolutePath,
      cause: (cause as Error).message,
    });
  }

  if (!stats.isFile()) {
    throw new StemSplitError(`Path is not a file: ${absolutePath}`, {
      httpStatus: 0,
      code: 'LOCAL_PATH_NOT_FILE',
      endpoint: 'local-fs',
      method: 'stat',
      path: absolutePath,
    });
  }

  if (stats.size > MAX_FILE_SIZE_BYTES) {
    throw new StemSplitError(
      `File is ${(stats.size / 1024 / 1024).toFixed(1)} MB, exceeds the ${MAX_FILE_SIZE_MB} MB limit.`,
      {
        httpStatus: 0,
        code: 'FILE_TOO_LARGE',
        endpoint: 'local-fs',
        method: 'stat',
        path: absolutePath,
        maxSizeBytes: MAX_FILE_SIZE_BYTES,
        actualSizeBytes: stats.size,
      },
    );
  }

  const fileName = basename(absolutePath);
  const ext = extname(fileName).replace(/^\./, '').toLowerCase();

  if (!(SUPPORTED_INPUT_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new StemSplitError(
      `Unsupported file extension ".${ext}". Supported: ${SUPPORTED_INPUT_EXTENSIONS.join(', ')}.`,
      {
        httpStatus: 0,
        code: 'UNSUPPORTED_FORMAT',
        endpoint: 'local-fs',
        method: 'stat',
        path: absolutePath,
        supportedFormats: SUPPORTED_INPUT_EXTENSIONS,
      },
    );
  }

  const contentType = MIME_BY_EXT[ext as InputExtension] ?? 'application/octet-stream';

  const presigned = await client.requestUpload(fileName, contentType);

  const nodeStream = createReadStream(absolutePath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

  await client.uploadToPresignedUrl(presigned.uploadUrl, webStream, contentType, stats.size);

  return {
    uploadKey: presigned.uploadKey,
    fileName,
    contentType,
    fileSizeBytes: stats.size,
  };
}
