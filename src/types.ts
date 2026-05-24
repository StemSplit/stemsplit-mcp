export const STEM_JOB_STATUSES = [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'EXPIRED',
] as const;
export type StemJobStatus = (typeof STEM_JOB_STATUSES)[number];

export const OUTPUT_TYPES = [
  'VOCALS',
  'INSTRUMENTAL',
  'BOTH',
  'FOUR_STEMS',
  'SIX_STEMS',
] as const;
export type OutputType = (typeof OUTPUT_TYPES)[number];

export const QUALITIES = ['FAST', 'BALANCED', 'BEST'] as const;
export type Quality = (typeof QUALITIES)[number];

export const OUTPUT_FORMATS = ['MP3', 'WAV', 'FLAC'] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export const SUPPORTED_INPUT_EXTENSIONS = [
  'mp3',
  'wav',
  'flac',
  'm4a',
  'ogg',
  'webm',
  'aac',
  'wma',
] as const;
export type InputExtension = (typeof SUPPORTED_INPUT_EXTENSIONS)[number];

export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
export const MAX_FILE_SIZE_MB = 100;
export const MAX_DURATION_SECONDS = 60 * 60;
export const MIN_DURATION_SECONDS = 5;

export interface UploadResponse {
  uploadUrl: string;
  uploadKey: string;
  expiresAt: string;
  maxFileSizeBytes: number;
  maxFileSizeMb: number;
  contentType: string;
}

export interface StemOutput {
  url: string;
  expiresAt: string;
}

export type StemKey =
  | 'vocals'
  | 'instrumental'
  | 'drums'
  | 'bass'
  | 'other'
  | 'piano'
  | 'guitar';

export type StemOutputs = Partial<Record<StemKey, StemOutput>>;

export interface StemJobInput {
  fileName: string;
  durationSeconds: number;
  fileSizeBytes: number;
}

export interface StemJobOptions {
  outputType: OutputType;
  quality: Quality;
  outputFormat: OutputFormat;
}

export interface StemJobCreateResponse {
  id: string;
  status: StemJobStatus;
  progress: number;
  createdAt: string;
  estimatedSeconds: number;
  creditsRequired: number;
  input: StemJobInput;
  options: StemJobOptions;
  outputs: null;
  metadata: Record<string, unknown> | null;
}

export interface StemJobDetailResponse {
  id: string;
  status: StemJobStatus;
  progress: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  input: StemJobInput;
  options: StemJobOptions;
  outputs: StemOutputs | null;
  creditsCharged: number;
  errorMessage: string | null;
  errorDetails: string | null;
  expiresAt: string | null;
}

export interface StemJobListItem {
  id: string;
  status: StemJobStatus;
  progress: number;
  createdAt: string;
  completedAt: string | null;
  input: { fileName: string; durationSeconds: number };
  options: StemJobOptions;
  creditsCharged: number;
  errorMessage: string | null;
}

export interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface StemJobListResponse {
  jobs: StemJobListItem[];
  pagination: Pagination;
}

export interface YoutubeJobCreateResponse {
  id: string;
  status: StemJobStatus;
  videoId: string;
  videoTitle: string;
  videoDuration: number;
  videoThumbnail: string;
  channelName: string;
  channelId?: string;
  videoDescription?: string;
  publishedAt?: string;
  tags?: string[];
  categoryId?: string;
  definition?: 'hd' | 'sd';
  hasCaptions?: boolean;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  creditsRequired: number;
  outputs: ['vocals', 'instrumental'];
  createdAt: string;
}

export interface YoutubeJobDetailResponse {
  id: string;
  status: StemJobStatus;
  progress: number;
  progressPhase?: string | null;
  videoId: string;
  videoTitle: string;
  videoDuration: number;
  videoThumbnail: string;
  channelName: string;
  creditsCharged: number;
  createdAt: string;
  completedAt: string | null;
  errorMessage?: string;
  outputs?: {
    fullAudio?: StemOutput;
    vocals?: StemOutput;
    instrumental?: StemOutput;
  };
}

export interface YoutubeJobListItem {
  id: string;
  status: StemJobStatus;
  progress: number;
  videoId: string;
  videoTitle: string;
  videoDuration: number;
  videoThumbnail: string;
  channelName: string;
  creditsCharged: number;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface YoutubeJobListResponse {
  jobs: YoutubeJobListItem[];
  pagination: Pagination;
}

export interface SoundcloudJobCreateResponse {
  id: string;
  status: StemJobStatus;
  trackId: string;
  trackTitle: string;
  trackDuration: number;
  trackDurationEstimated: boolean;
  trackArtwork: string | null;
  artistName: string;
  creditsRequired: number;
  outputs: ['vocals', 'instrumental'];
  createdAt: string;
  note?: string;
}

export interface SoundcloudJobDetailResponse {
  id: string;
  status: StemJobStatus;
  progress: number;
  progressPhase?: string | null;
  soundcloudUrl: string;
  trackId: string;
  trackTitle: string;
  trackDuration: number;
  trackArtwork: string | null;
  artistName: string;
  creditsCharged: number;
  createdAt: string;
  completedAt: string | null;
  errorMessage?: string;
  outputs?: {
    fullAudio?: StemOutput;
    vocals?: StemOutput;
    instrumental?: StemOutput;
  };
}

export interface SoundcloudJobListItem {
  id: string;
  status: StemJobStatus;
  progress: number;
  trackId: string;
  trackTitle: string;
  trackDuration: number;
  trackArtwork: string | null;
  artistName: string;
  creditsCharged: number;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface SoundcloudJobListResponse {
  jobs: SoundcloudJobListItem[];
  pagination: Pagination;
}

export interface BalanceResponse {
  balanceSeconds: number;
  balanceMinutes: number;
  balanceFormatted: string;
  updatedAt: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    [key: string]: unknown;
  };
}

export function isTerminalStatus(status: StemJobStatus): boolean {
  return status === 'COMPLETED' || status === 'FAILED' || status === 'EXPIRED';
}
