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

export type { RepoResult, SearchParams, SearchResult, SortKey, UpdatedWithin } from './db/search';

export interface DbStats {
  count: number;
  sizeBytes: number;
  baseVersion: string | null;
  appliedDeltas: string[];
  lastUpdateCheck: string | null;
  /** Newest data day (base, last package or manual update). */
  dataDate: string | null;
  pending: number;
}

export interface UpdateStatus {
  running: boolean;
  job: 'packages' | 'manual' | 'merge-base' | 'vacuum' | null;
  text: string;
  added: number;
  updated: number;
  /** A manual update was interrupted and can continue. */
  paused: boolean;
  error: string | null;
  offline: boolean;
}

export type LiveSearchResult =
  | { ok: true; found: number; fresh: number; ids: number[] }
  | { ok: false; reason: 'offline' | 'ratelimited' | 'error'; withToken?: boolean; message?: string };

export type ThemeSetting = 'system' | 'light' | 'dark';

export interface AppInfo {
  version: string;
  platform: string;
  projectRepoUrl: string;
  isDev: boolean;
}

export interface SettingsState {
  theme: ThemeSetting;
  autoUpdate: boolean;
  hasOwnToken: boolean;
  encryptionAvailable: boolean;
}

export type TokenResult = { ok: true } | { ok: false; message: string };

export interface DeviceFlowInfo {
  userCode: string;
  verificationUri: string;
  expiresAt: string;
}

export interface NetworkState {
  /** null = never answered (first start). */
  consent: 'yes' | 'no' | null;
  /** Show the consent dialog (first start or new consent text for members). */
  askConsent: boolean;
  member: { login: string; joinedDay: string } | null;
  signIn: { state: 'idle' } | { state: 'waiting'; info: DeviceFlowInfo } | { state: 'registering' } | { state: 'error'; message: string };
}

export interface ServerUserData {
  login: string;
  appVersion: string | null;
  joinedDay: string;
  lastActiveDay: string;
  submissions: number;
  status: string;
  pendingSubmissions: number;
}

export type MyDataResult = { ok: true; data: ServerUserData } | { ok: false; message: string };
