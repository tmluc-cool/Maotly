import { useEffect, useState } from 'react';
import type { RateLimitInfo, SettingsState, ThemeSetting } from '@shared/types';
import { formatDate, formatDateTime } from '../lib/format';
import { useApp } from '../state';

const TOKEN_HELP_URL =
  'https://docs.github.com/de/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token';

function LimitText({ info }: { info: RateLimitInfo }) {
  if (info.remaining === null || info.limit === null) return <>unbekannt (offline?)</>;
  return (
    <>
      {info.remaining} von {info.limit}
      {info.resetAt && <span className="text-slate-500 dark:text-slate-400"> · zurückgesetzt um {formatDateTime(info.resetAt)}</span>}
    </>
  );
}

export function SettingsPage() {
  const { theme, setTheme, snapshotDate, newestFetch, applyStatsState, setStatus } = useApp();
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [token, setToken] = useState('');
  const [tokenMsg, setTokenMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const reload = async () => setSettings(await window.api.getSettings());
  useEffect(() => {
    void reload();
  }, []);

  const saveToken = async () => {
    setBusy('token');
    setTokenMsg(null);
    try {
      const res = await window.api.setToken(token);
      if (res.ok) {
        setToken('');
        setTokenMsg({ ok: true, text: 'Token gespeichert. Du hast jetzt 5000 Anfragen pro Stunde.' });
        await reload();
      } else {
        setTokenMsg({ ok: false, text: res.message });
      }
    } finally {
      setBusy(null);
    }
  };

  const removeToken = async () => {
    setBusy('token');
    try {
      setSettings(await window.api.clearToken());
      setTokenMsg({ ok: true, text: 'Token entfernt.' });
    } finally {
      setBusy(null);
    }
  };

  const clearCache = async () => {
    setBusy('cache');
    try {
      applyStatsState(await window.api.clearCache());
      setStatus(null);
      setActionMsg('Cache geleert. Die App nutzt jetzt wieder die mitgelieferten Daten.');
    } finally {
      setBusy(null);
    }
  };

  const refreshAll = async () => {
    if (!settings?.hasToken) {
      const ok = window.confirm(
        'Ohne eigenen GitHub-Token sind nur 60 Anfragen pro Stunde erlaubt. Für alle Daten braucht es über 200.\n\n' +
          'Die App aktualisiert so viel wie möglich und hört dann auf. Trotzdem starten?',
      );
      if (!ok) return;
    }
    setBusy('refresh');
    setActionMsg(null);
    try {
      const res = await window.api.refreshAll();
      applyStatsState(await window.api.getAllStats());
      setStatus(res.status);
      const suffix =
        res.status.kind === 'ratelimited'
          ? ' GitHub-Limit erreicht – der Rest folgt später.'
          : res.status.kind === 'offline'
            ? ' Du bist offline.'
            : '';
      setActionMsg(`${res.updated} Repos aktualisiert.${suffix}`);
      await reload();
    } finally {
      setBusy(null);
    }
  };

  const themes: { value: ThemeSetting; label: string }[] = [
    { value: 'system', label: 'Wie das System' },
    { value: 'light', label: 'Hell' },
    { value: 'dark', label: 'Dunkel' },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 pb-16 pt-8">
      <h1 className="text-3xl font-extrabold tracking-tight">Einstellungen</h1>

      <section className="card">
        <h2 className="text-lg font-bold">Eigener GitHub-Token (freiwillig)</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Ohne Token erlaubt GitHub 60 Anfragen pro Stunde. Mit einem eigenen Token sind es 5000. Der Token braucht keine
          Berechtigungen und wird verschlüsselt auf diesem Computer gespeichert.{' '}
          <button type="button" className="text-brand-700 underline dark:text-brand-300" onClick={() => void window.api.openExternal(TOKEN_HELP_URL)}>
            So erstellst du einen Token
          </button>
        </p>

        {settings?.hasToken ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
              Token ist gespeichert
            </span>
            <button type="button" className="btn-secondary" disabled={busy === 'token'} onClick={() => void removeToken()}>
              Token entfernen
            </button>
          </div>
        ) : (
          <form
            className="mt-4 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void saveToken();
            }}
          >
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="github_pat_…"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
              aria-label="GitHub-Token"
              disabled={settings ? !settings.tokenEncryptionAvailable : false}
            />
            <button type="submit" className="btn-primary" disabled={!token.trim() || busy === 'token' || !settings?.tokenEncryptionAvailable}>
              {busy === 'token' ? 'Prüfe …' : 'Speichern'}
            </button>
          </form>
        )}
        {settings && !settings.tokenEncryptionAvailable && (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
            Dein System bietet keine sichere Verschlüsselung an. Ein Token kann deshalb nicht gespeichert werden.
          </p>
        )}
        {tokenMsg && (
          <p className={`mt-2 text-sm ${tokenMsg.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
            {tokenMsg.text}
          </p>
        )}
      </section>

      <section className="card">
        <h2 className="text-lg font-bold">Daten</h2>
        <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-slate-500 dark:text-slate-400">Verbleibende GitHub-Anfragen</dt>
          <dd>{settings ? <LimitText info={settings.rateLimit} /> : '…'}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Verbleibende Suchen</dt>
          <dd>{settings ? <LimitText info={settings.searchRateLimit} /> : '…'}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Mitgelieferte Daten vom</dt>
          <dd>{formatDate(snapshotDate)}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Zuletzt live aktualisiert</dt>
          <dd>{newestFetch ? formatDateTime(newestFetch) : 'noch nie'}</dd>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" disabled={busy !== null} onClick={() => void clearCache()}>
            Cache leeren
          </button>
          <button type="button" className="btn-primary" disabled={busy !== null} onClick={() => void refreshAll()}>
            {busy === 'refresh' ? 'Aktualisiere …' : 'Alle Daten jetzt aktualisieren'}
          </button>
        </div>
        {!settings?.hasToken && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Hinweis: Ohne Token reicht das Limit nicht für alle Daten auf einmal.
          </p>
        )}
        {actionMsg && <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{actionMsg}</p>}
      </section>

      <section className="card">
        <h2 className="text-lg font-bold">Darstellung</h2>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Farbschema">
          {themes.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={theme === t.value}
              aria-pressed={theme === t.value}
              className="chip-toggle"
              onClick={() => setTheme(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
