import type {
  AppInfo,
  DownloadEvent,
  DownloadStartResult,
  LiveSearchResult,
  RefreshAllResult,
  RefreshResult,
  SettingsState,
  StatsState,
  ThemeSetting,
  TokenResult,
} from './types';

export const IPC = {
  statsGetAll: 'stats:getAll',
  statsRefresh: 'stats:refresh',
  statsRefreshAll: 'stats:refreshAll',
  cacheClear: 'cache:clear',
  searchLive: 'search:live',
  settingsGet: 'settings:get',
  tokenSet: 'token:set',
  tokenClear: 'token:clear',
  themeSet: 'theme:set',
  appInfo: 'app:info',
  openExternal: 'shell:openExternal',
  downloadStart: 'download:start',
  downloadShow: 'download:show',
  downloadEvent: 'download:event',
} as const;

/** The API the preload script exposes as window.api. */
export interface GratisStattApi {
  getAllStats(): Promise<StatsState>;
  refreshRepos(repos: string[]): Promise<RefreshResult>;
  refreshAll(): Promise<RefreshAllResult>;
  clearCache(): Promise<StatsState>;
  searchLive(term: string): Promise<LiveSearchResult>;
  getSettings(): Promise<SettingsState>;
  setToken(token: string): Promise<TokenResult>;
  clearToken(): Promise<SettingsState>;
  setTheme(theme: ThemeSetting): Promise<void>;
  getAppInfo(): Promise<AppInfo>;
  openExternal(url: string): Promise<void>;
  startDownload(repo: string, assetName: string): Promise<DownloadStartResult>;
  showDownload(id: string): Promise<void>;
  onDownloadEvent(listener: (event: DownloadEvent) => void): () => void;
}
