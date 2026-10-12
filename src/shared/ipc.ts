import type {
  AppInfo,
  DbStats,
  LiveSearchResult,
  MyDataResult,
  NetworkState,
  RepoResult,
  SearchParams,
  SearchResult,
  SettingsState,
  ThemeSetting,
  TokenResult,
  UpdateStatus,
} from './types';

export const IPC = {
  search: 'db:search',
  curated: 'db:curated',
  newly: 'db:newly',
  stats: 'db:stats',
  vacuum: 'db:vacuum',
  liveSearch: 'live:search',
  updateStatus: 'update:status',
  updateNow: 'update:now',
  updatePause: 'update:pause',
  updateEvent: 'update:event',
  dataChanged: 'data:changed',
  settingsGet: 'settings:get',
  themeSet: 'settings:theme',
  autoUpdateSet: 'settings:autoUpdate',
  tokenSet: 'token:set',
  tokenClear: 'token:clear',
  networkGet: 'network:get',
  networkAsk: 'network:ask',
  networkEvent: 'network:event',
  networkDecline: 'network:decline',
  networkJoin: 'network:join',
  networkCancelJoin: 'network:cancelJoin',
  networkLeave: 'network:leave',
  networkMyData: 'network:myData',
  appInfo: 'app:info',
  openExternal: 'shell:openExternal',
  devResetCheck: 'dev:resetCheck',
  devShowConsent: 'dev:showConsent',
} as const;

/** The API the preload script exposes as window.api. */
export interface GratisStattApi {
  search(params: SearchParams): Promise<SearchResult>;
  curated(repos: string[]): Promise<Record<string, RepoResult>>;
  newlyDiscovered(): Promise<RepoResult[]>;
  stats(): Promise<DbStats>;
  vacuum(): Promise<void>;
  liveSearch(term: string): Promise<LiveSearchResult>;

  updateStatus(): Promise<UpdateStatus>;
  updateNow(): Promise<void>;
  updatePause(): Promise<void>;
  onUpdateStatus(listener: (s: UpdateStatus) => void): () => void;
  /** Fires after new data arrived (packages, manual update, base merge). */
  onDataChanged(listener: () => void): () => void;

  getSettings(): Promise<SettingsState>;
  setTheme(theme: ThemeSetting): Promise<void>;
  setAutoUpdate(on: boolean): Promise<void>;
  setToken(token: string): Promise<TokenResult>;
  clearToken(): Promise<SettingsState>;

  networkState(): Promise<NetworkState>;
  onNetworkState(listener: (s: NetworkState) => void): () => void;
  /** Opens the consent dialog (switching the network on in the settings). */
  askNetwork(): Promise<void>;
  declineNetwork(): Promise<void>;
  joinNetwork(): Promise<void>;
  cancelJoin(): Promise<void>;
  leaveNetwork(): Promise<{ ok: boolean; message?: string }>;
  myData(): Promise<MyDataResult>;

  getAppInfo(): Promise<AppInfo>;
  openExternal(url: string): Promise<void>;
  devResetCheck(): Promise<void>;
  devShowConsent(): Promise<void>;
}
