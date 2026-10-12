import type { Lang, Text } from './i18n';

export type Platform = 'windows' | 'mac' | 'linux' | 'android' | 'ios' | 'web' | 'server';
export type Level = 'einfach' | 'mittel' | 'profi';

export const PLATFORMS: Platform[] = ['windows', 'mac', 'linux', 'android', 'ios', 'web', 'server'];
export const LEVELS: Level[] = ['einfach', 'mittel', 'profi'];

export type { Lang, Text } from './i18n';

export interface Alternative {
  repo: string;
  /** Max. 120 characters per language, plain language. */
  summary: Text;
  platforms: Platform[];
  level: Level;
  website?: string;
  note?: Text;
}

export interface PaidProduct {
  id: string;
  /** Brand name(s), not translated. */
  name: string;
  /** Search terms in all languages. */
  aliases: string[];
  category: string;
  note?: Text;
  alternatives: Alternative[];
}

export interface Category {
  id: string;
  name: Text;
}

export interface AlternativesData {
  categories: Category[];
  products: PaidProduct[];
}

export type { RepoResult, SearchParams, SearchResult, SortKey, UpdatedWithin } from './db/search';
export type { RatingSummary, Review, ReviewWithState } from './db/reviews';
import type { RepoResult } from './db/search';
import type { RatingSummary, ReviewWithState } from './db/reviews';

export interface RepoDetails {
  repo: RepoResult | null;
  reviews: ReviewWithState[];
  summary: RatingSummary;
}

export type ActionResult = { ok: true } | { ok: false; message: string };

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

/** What an update is doing right now; the renderer turns it into text. */
export type ProgressPhase = 'starting' | 'checking' | 'packages' | 'github' | 'merge-base' | 'vacuum';

export interface UpdateStatus {
  running: boolean;
  job: 'packages' | 'manual' | 'merge-base' | 'vacuum' | null;
  phase: ProgressPhase | null;
  /** Package number and count while several packages are applied. */
  index?: number;
  of?: number;
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

/** A newer version of the app itself is available on GitHub. */
export interface AppUpdateInfo {
  version: string;
  url: string;
}

export interface AppInfo {
  version: string;
  platform: string;
  projectRepoUrl: string;
  /** GitHub Sponsors page of the project. */
  sponsorUrl: string;
  isDev: boolean;
}

export interface SettingsState {
  theme: ThemeSetting;
  language: Lang;
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

export interface GitHubAccountState {
  /** false while the OAuth App of this build is not set up. */
  available: boolean;
  /** GitHub username while signed in. */
  login: string | null;
  flow: { state: 'idle' } | { state: 'waiting'; info: DeviceFlowInfo } | { state: 'checking' } | { state: 'error'; message: string };
}

export interface NetworkState {
  /** false while server/OAuth App of this build are not set up yet. */
  available: boolean;
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
  reviews?: number;
  votes?: number;
}

export type MyDataResult = { ok: true; data: ServerUserData } | { ok: false; message: string };
