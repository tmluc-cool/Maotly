export type Platform = 'windows' | 'mac' | 'linux' | 'android' | 'ios' | 'web' | 'server';
export type Level = 'einfach' | 'mittel' | 'profi';

export const PLATFORMS: Platform[] = ['windows', 'mac', 'linux', 'android', 'ios', 'web', 'server'];
export const LEVELS: Level[] = ['einfach', 'mittel', 'profi'];

export interface Alternative {
  repo: string;
  summary: string;
  platforms: Platform[];
  level: Level;
  website?: string;
  note?: string;
}

export interface PaidProduct {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  note?: string;
  alternatives: Alternative[];
}

export interface Category {
  id: string;
  name: string;
}

export interface AlternativesData {
  categories: Category[];
  products: PaidProduct[];
}

export interface ReleaseAsset {
  name: string;
  size: number;
  url: string;
}

export interface LatestRelease {
  tag: string;
  date: string | null;
  assets: ReleaseAsset[];
}

export interface RepoStats {
  stars: number;
  pushedAt: string | null;
  license: string | null;
  description: string | null;
  homepage: string | null;
  archived: boolean;
  topics: string[];
  latestRelease: LatestRelease | null;
}

export interface Snapshot {
  generatedAt: string;
  /** 'seed' = only stars from a search, no releases. 'full' = written by fetch-stats. */
  source?: 'seed' | 'full';
  repos: Record<string, RepoStats>;
}

export type StatsSource = 'snapshot' | 'cache' | 'live';

export interface RepoEntry {
  stats: RepoStats;
  fetchedAt: string;
  source: StatsSource;
}

export type DataStatusKind = 'ok' | 'offline' | 'ratelimited';

export interface DataStatus {
  kind: DataStatusKind;
  /** Oldest data date of the repos involved (ISO). */
  dataDate: string | null;
  /** When the GitHub limit resets (ISO), only for 'ratelimited'. */
  resetAt?: string | null;
}

export interface RateLimitInfo {
  limit: number | null;
  remaining: number | null;
  resetAt: string | null;
}

export interface StatsState {
  repos: Record<string, RepoEntry>;
  snapshotDate: string;
  newestFetch: string | null;
}

export interface RefreshResult {
  repos: Record<string, RepoEntry>;
  status: DataStatus;
}

export interface SearchHit {
  repo: string;
  description: string | null;
  stars: number;
  pushedAt: string | null;
  license: string | null;
  archived: boolean;
  url: string;
}

export type LiveSearchResult =
  | { ok: true; hits: SearchHit[] }
  | { ok: false; reason: 'offline' | 'ratelimited' | 'error'; resetAt?: string | null; message?: string };

export type ThemeSetting = 'system' | 'light' | 'dark';

export interface AppInfo {
  version: string;
  platform: string;
  projectRepoUrl: string;
}

export interface SettingsState {
  hasToken: boolean;
  tokenEncryptionAvailable: boolean;
  theme: ThemeSetting;
  rateLimit: RateLimitInfo;
  searchRateLimit: RateLimitInfo;
}

export type TokenResult = { ok: true } | { ok: false; message: string };

export interface RefreshAllResult {
  updated: number;
  failed: number;
  status: DataStatus;
}

export type DownloadEvent =
  | { id: string; type: 'progress'; received: number; total: number | null }
  | { id: string; type: 'done'; fileName: string }
  | { id: string; type: 'error'; message: string };

export type DownloadStartResult = { ok: true; id: string } | { ok: false; message: string };
