import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppInfo, DataStatus, RepoEntry, StatsState, ThemeSetting } from '@shared/types';

export interface DownloadState {
  id: string;
  state: 'running' | 'done' | 'error';
  received: number;
  total: number | null;
  fileName?: string;
  message?: string;
}

interface AppState {
  ready: boolean;
  entries: Record<string, RepoEntry>;
  snapshotDate: string | null;
  newestFetch: string | null;
  status: DataStatus | null;
  refreshing: boolean;
  info: AppInfo | null;
  theme: ThemeSetting;
  downloads: Record<string, DownloadState>;
  refreshRepos(repos: string[]): Promise<void>;
  applyStatsState(state: StatsState): void;
  setStatus(status: DataStatus | null): void;
  setTheme(theme: ThemeSetting): void;
  startDownload(repo: string, assetName: string): Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp outside provider');
  return ctx;
}

function applyThemeClass(theme: ThemeSetting) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [entries, setEntries] = useState<Record<string, RepoEntry>>({});
  const [snapshotDate, setSnapshotDate] = useState<string | null>(null);
  const [newestFetch, setNewestFetch] = useState<string | null>(null);
  const [status, setStatus] = useState<DataStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [theme, setThemeState] = useState<ThemeSetting>('system');
  // Downloads are keyed by repo so each card knows its own progress.
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});

  const applyStatsState = useCallback((s: StatsState) => {
    setEntries(s.repos);
    setSnapshotDate(s.snapshotDate);
    setNewestFetch(s.newestFetch);
  }, []);

  useEffect(() => {
    void (async () => {
      const [stats, appInfo] = await Promise.all([window.api.getAllStats(), window.api.getAppInfo()]);
      applyStatsState(stats);
      setInfo(appInfo);
      setReady(true);
      const settings = await window.api.getSettings();
      setThemeState(settings.theme);
    })();
  }, [applyStatsState]);

  useEffect(() => {
    applyThemeClass(theme);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyThemeClass(theme);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  useEffect(
    () =>
      window.api.onDownloadEvent((ev) => {
        setDownloads((prev) => {
          const repo = Object.keys(prev).find((r) => prev[r].id === ev.id);
          if (!repo) return prev;
          const cur = prev[repo];
          if (ev.type === 'progress') return { ...prev, [repo]: { ...cur, received: ev.received, total: ev.total } };
          if (ev.type === 'done') return { ...prev, [repo]: { ...cur, state: 'done', fileName: ev.fileName } };
          return { ...prev, [repo]: { ...cur, state: 'error', message: ev.message } };
        });
      }),
    [],
  );

  const refreshRepos = useCallback(async (repos: string[]) => {
    setRefreshing(true);
    try {
      const res = await window.api.refreshRepos(repos);
      setEntries((prev) => ({ ...prev, ...res.repos }));
      setStatus(res.status);
      if (res.status.kind === 'ok') {
        const s = await window.api.getAllStats();
        setNewestFetch(s.newestFetch);
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  const setTheme = useCallback((t: ThemeSetting) => {
    setThemeState(t);
    void window.api.setTheme(t);
  }, []);

  const startDownload = useCallback(async (repo: string, assetName: string) => {
    const res = await window.api.startDownload(repo, assetName);
    if (res.ok) {
      setDownloads((prev) => ({ ...prev, [repo]: { id: res.id, state: 'running', received: 0, total: null } }));
    } else {
      setDownloads((prev) => ({ ...prev, [repo]: { id: '', state: 'error', received: 0, total: null, message: res.message } }));
    }
  }, []);

  const value = useMemo<AppState>(
    () => ({
      ready,
      entries,
      snapshotDate,
      newestFetch,
      status,
      refreshing,
      info,
      theme,
      downloads,
      refreshRepos,
      applyStatsState,
      setStatus,
      setTheme,
      startDownload,
    }),
    [ready, entries, snapshotDate, newestFetch, status, refreshing, info, theme, downloads, refreshRepos, applyStatsState, setTheme, startDownload],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
