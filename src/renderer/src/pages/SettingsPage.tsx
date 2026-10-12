import { useEffect, useRef, useState } from 'react';
import type { MyDataResult, SettingsState, ThemeSetting } from '@shared/types';
import { formatBytes, formatCount, formatDate, formatDateTime } from '../lib/format';
import { href } from '../lib/router';
import { useApp } from '../state';

const TOKEN_HELP_URL = 'https://github.com/settings/personal-access-tokens/new';

function Toggle({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <span className="relative inline-flex">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-brand-500 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40 dark:bg-slate-700" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
      <span className="font-medium">{label}</span>
    </label>
  );
}

function NetworkSection() {
  const { network } = useApp();
  const [myData, setMyData] = useState<MyDataResult | null>(null);
  const [leaveMsg, setLeaveMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const leaveRef = useRef<HTMLDialogElement>(null);
  const member = network?.member;

  const leave = async () => {
    setBusy(true);
    try {
      const r = await window.api.leaveNetwork();
      leaveRef.current?.close();
      setMyData(null);
      setLeaveMsg(r.ok ? 'Du hast das Netzwerk verlassen. Deine Daten auf dem Server sind gelöscht.' : (r.message ?? null));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card space-y-4">
      <h2 className="text-lg font-bold">GratisStatt-Netzwerk</h2>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Freiwillig. Wer mitmacht, schlägt Projekte aus der Live-Suche für alle vor. Gespeichert werden nur GitHub-Benutzername,
        App-Version, letzter aktiver Tag und Anzahl Beiträge.
      </p>
      <p className="font-medium">
        {member ? (
          <>
            Dabei als @{member.login} seit {formatDate(member.joinedDay)}
            {myData?.ok && <> · {myData.data.submissions} Beiträge</>}
          </>
        ) : (
          'Nicht dabei'
        )}
      </p>
      {network && !network.available && !member ? (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          Das Netzwerk ist in dieser Version noch nicht eingerichtet. Die App funktioniert ganz normal ohne – es werden keine
          Daten an einen Server geschickt.
        </p>
      ) : (
      <Toggle
        checked={!!member}
        label="Mitmachen"
        onChange={(on) => {
          setLeaveMsg(null);
          if (on) void window.api.askNetwork();
          else leaveRef.current?.showModal();
        }}
      />
      )}
      <div className="flex flex-wrap gap-2">
        {member && (
          <button type="button" className="btn-secondary" onClick={() => void window.api.myData().then(setMyData)}>
            Meine gespeicherten Daten anzeigen
          </button>
        )}
        <a className="btn-secondary" href={href.privacy()}>
          Datenschutzerklärung
        </a>
      </div>
      {myData &&
        (myData.ok ? (
          <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-1 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800/60">
            <dt className="text-slate-500">GitHub-Benutzername</dt>
            <dd>@{myData.data.login}</dd>
            <dt className="text-slate-500">App-Version</dt>
            <dd>{myData.data.appVersion ?? '–'}</dd>
            <dt className="text-slate-500">Dabei seit</dt>
            <dd>{formatDate(myData.data.joinedDay)}</dd>
            <dt className="text-slate-500">Zuletzt aktiv</dt>
            <dd>{formatDate(myData.data.lastActiveDay)}</dd>
            <dt className="text-slate-500">Beiträge</dt>
            <dd>
              {myData.data.submissions} ({myData.data.pendingSubmissions} noch in Prüfung)
            </dd>
            <dt className="text-slate-500">Status</dt>
            <dd>{myData.data.status === 'active' ? 'aktiv' : 'gesperrt'}</dd>
            <dd className="col-span-2 pt-2 text-xs text-slate-500">Mehr speichert der Server nicht über dich.</dd>
          </dl>
        ) : (
          <p className="text-sm text-rose-700 dark:text-rose-300">{myData.message}</p>
        ))}
      {leaveMsg && <p className="text-sm">{leaveMsg}</p>}

      <dialog
        ref={leaveRef}
        className="w-[min(28rem,calc(100vw-2rem))] rounded-2xl bg-white p-6 text-slate-900 shadow-2xl backdrop:bg-slate-950/60 dark:bg-slate-900 dark:text-slate-100"
      >
        <h3 className="text-lg font-bold">Netzwerk verlassen?</h3>
        <p className="mt-2">Deine Daten auf dem Server werden gelöscht.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className="btn-primary bg-rose-600 hover:bg-rose-700" disabled={busy} onClick={() => void leave()}>
            {busy ? 'Lösche …' : 'Verlassen und Daten löschen'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => leaveRef.current?.close()}>
            Abbrechen
          </button>
        </div>
      </dialog>
    </section>
  );
}

export function SettingsPage() {
  const { theme, setTheme, stats, update, network, info, refreshStats } = useApp();
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [token, setToken] = useState('');
  const [tokenMsg, setTokenMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.api.getSettings().then(setSettings);
    void refreshStats();
  }, [refreshStats]);

  const saveToken = async () => {
    setBusy(true);
    setTokenMsg(null);
    try {
      const res = await window.api.setToken(token);
      if (res.ok) {
        setToken('');
        setTokenMsg({ ok: true, text: 'Token gespeichert.' });
        setSettings(await window.api.getSettings());
      } else setTokenMsg({ ok: false, text: res.message });
    } finally {
      setBusy(false);
    }
  };

  const themes: { value: ThemeSetting; label: string }[] = [
    { value: 'system', label: 'Wie das System' },
    { value: 'light', label: 'Hell' },
    { value: 'dark', label: 'Dunkel' },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 pb-20 pt-8">
      <h1 className="text-3xl font-extrabold tracking-tight">Einstellungen</h1>

      <NetworkSection />

      {!network?.member && (
        <section className="card">
          <h2 className="text-lg font-bold">Eigener GitHub-Token (freiwillig)</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Macht das manuelle Update etwa 3× schneller (30 statt 10 Suchen pro Minute). Der Token braucht keine Berechtigungen
            und wird verschlüsselt auf diesem Computer gespeichert.{' '}
            <button type="button" className="text-brand-700 underline dark:text-brand-300" onClick={() => void window.api.openExternal(TOKEN_HELP_URL)}>
              Token auf GitHub erstellen
            </button>
          </p>
          {settings?.hasOwnToken ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
                Token ist gespeichert
              </span>
              <button type="button" className="btn-secondary" onClick={() => void window.api.clearToken().then(setSettings)}>
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
                disabled={settings ? !settings.encryptionAvailable : false}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
                aria-label="GitHub-Token"
              />
              <button type="submit" className="btn-primary" disabled={!token.trim() || busy || !settings?.encryptionAvailable}>
                {busy ? 'Prüfe …' : 'Speichern'}
              </button>
            </form>
          )}
          {settings && !settings.encryptionAvailable && (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">Dein System bietet keine sichere Verschlüsselung an. Ein Token kann nicht gespeichert werden.</p>
          )}
          {tokenMsg && <p className={`mt-2 text-sm ${tokenMsg.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>{tokenMsg.text}</p>}
        </section>
      )}

      <section className="card space-y-4">
        <h2 className="text-lg font-bold">Datenbank und Updates</h2>
        {settings && (
          <Toggle
            checked={settings.autoUpdate}
            label="Automatisch einmal pro Woche aktualisieren"
            onChange={(on) => {
              setSettings({ ...settings, autoUpdate: on });
              void window.api.setAutoUpdate(on);
            }}
          />
        )}
        <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-1.5 text-sm">
          <dt className="text-slate-500 dark:text-slate-400">Projekte</dt>
          <dd>{stats ? formatCount(stats.count) : '…'}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Datenbank-Grösse</dt>
          <dd>{stats ? formatBytes(stats.sizeBytes) : '…'}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Datenstand</dt>
          <dd>{formatDate(stats?.dataDate)}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Basis-Version</dt>
          <dd>{formatDate(stats?.baseVersion)}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Letzte Update-Prüfung</dt>
          <dd>{stats?.lastUpdateCheck ? formatDateTime(stats.lastUpdateCheck) : 'noch nie'}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Angewendete Pakete</dt>
          <dd>{stats?.appliedDeltas.length ? `${stats.appliedDeltas.length} (zuletzt ${formatDate(stats.appliedDeltas.at(-1))})` : 'keine'}</dd>
        </dl>
        {update?.running && <p className="text-sm text-brand-700 dark:text-brand-300">{update.text}</p>}
        <div className="flex flex-wrap gap-2">
          {update?.running && update.job === 'manual' ? (
            <button type="button" className="btn-secondary" onClick={() => void window.api.updatePause()}>
              Update pausieren
            </button>
          ) : (
            <button type="button" className="btn-primary" disabled={update?.running} onClick={() => void window.api.updateNow()}>
              {update?.paused ? 'Update fortsetzen' : 'Jetzt aktualisieren'}
            </button>
          )}
          <button type="button" className="btn-secondary" disabled={update?.running} onClick={() => void window.api.vacuum()}>
            Datenbank optimieren
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-bold">Darstellung</h2>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Farbschema">
          {themes.map((t) => (
            <button key={t.value} type="button" role="radio" aria-checked={theme === t.value} aria-pressed={theme === t.value} className="chip-toggle" onClick={() => setTheme(t.value)}>
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {info?.isDev && (
        <section className="card border-dashed">
          <h2 className="text-lg font-bold">Entwickler (nur im Dev-Modus)</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => void window.api.devResetCheck().then(refreshStats)}>
              Letzte Update-Prüfung um 8 Tage zurücksetzen
            </button>
            <button type="button" className="btn-secondary" onClick={() => void window.api.devShowConsent()}>
              Ersten-Start-Dialog erneut zeigen
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
