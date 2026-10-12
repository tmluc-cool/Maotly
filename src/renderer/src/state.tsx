import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppInfo, DbStats, NetworkState, ThemeSetting, UpdateStatus } from '@shared/types';

interface AppState {
  ready: boolean;
  info: AppInfo | null;
  stats: DbStats | null;
  update: UpdateStatus | null;
  network: NetworkState | null;
  theme: ThemeSetting;
  /** Increases whenever new data arrived, so lists can reload. */
  dataVersion: number;
  setTheme(theme: ThemeSetting): void;
  refreshStats(): Promise<void>;
  bumpData(): void;
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
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [stats, setStats] = useState<DbStats | null>(null);
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [network, setNetwork] = useState<NetworkState | null>(null);
  const [theme, setThemeState] = useState<ThemeSetting>('system');
  const [dataVersion, setDataVersion] = useState(0);

  const refreshStats = useCallback(async () => setStats(await window.api.stats()), []);
  const bumpData = useCallback(() => {
    setDataVersion((v) => v + 1);
    void refreshStats();
  }, [refreshStats]);

  useEffect(() => {
    void (async () => {
      const [appInfo, s, u, n, settings] = await Promise.all([
        window.api.getAppInfo(),
        window.api.stats(),
        window.api.updateStatus(),
        window.api.networkState(),
        window.api.getSettings(),
      ]);
      setInfo(appInfo);
      setStats(s);
      setUpdate(u);
      setNetwork(n);
      setThemeState(settings.theme);
      setReady(true);
    })();
    const offs = [
      window.api.onUpdateStatus((s) => {
        setUpdate(s);
        if (!s.running) void refreshStats();
      }),
      window.api.onDataChanged(bumpData),
      window.api.onNetworkState(setNetwork),
    ];
    return () => offs.forEach((off) => off());
  }, [bumpData, refreshStats]);

  useEffect(() => {
    applyThemeClass(theme);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyThemeClass(theme);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((t: ThemeSetting) => {
    setThemeState(t);
    void window.api.setTheme(t);
  }, []);

  const value = useMemo<AppState>(
    () => ({ ready, info, stats, update, network, theme, dataVersion, setTheme, refreshStats, bumpData }),
    [ready, info, stats, update, network, theme, dataVersion, setTheme, refreshStats, bumpData],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
