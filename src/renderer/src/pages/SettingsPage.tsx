import { useEffect, useRef, useState } from 'react';
import { LANG_NAMES, LANGS } from '@shared/i18n';
import type { MyDataResult, SettingsState, ThemeSetting } from '@shared/types';
import { progressText } from '../components/StatusBar';
import { formatBytes, formatCount, formatDate, formatDateTime } from '../lib/format';
import { t } from '../lib/i18n';
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
      setLeaveMsg(r.ok ? t('net.left') : (r.message ?? null));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card space-y-4">
      <h2 className="text-lg font-bold">{t('net.title')}</h2>
      <p className="text-sm text-slate-600 dark:text-slate-400">{t('net.lead')}</p>
      <p className="font-medium">
        {member ? (
          <>
            {t('net.memberSince', { login: member.login, date: formatDate(member.joinedDay) })}
            {myData?.ok && <> · {t('net.contributions', { count: formatCount(myData.data.submissions) })}</>}
          </>
        ) : (
          t('net.notMember')
        )}
      </p>
      {network && !network.available && !member ? (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {t('net.notAvailable')}
        </p>
      ) : (
      <Toggle
        checked={!!member}
        label={t('net.join')}
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
            {t('net.showData')}
          </button>
        )}
        <a className="btn-secondary" href={href.privacy()}>
          {t('common.privacy')}
        </a>
      </div>
      {myData &&
        (myData.ok ? (
          <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-1 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800/60">
            <dt className="text-slate-500">{t('net.d.login')}</dt>
            <dd>@{myData.data.login}</dd>
            <dt className="text-slate-500">{t('net.d.appVersion')}</dt>
            <dd>{myData.data.appVersion ?? '–'}</dd>
            <dt className="text-slate-500">{t('net.d.joined')}</dt>
            <dd>{formatDate(myData.data.joinedDay)}</dd>
            <dt className="text-slate-500">{t('net.d.lastActive')}</dt>
            <dd>{formatDate(myData.data.lastActiveDay)}</dd>
            <dt className="text-slate-500">{t('net.d.contributions')}</dt>
            <dd>{t('net.d.contributionsValue', { submissions: myData.data.submissions, pending: myData.data.pendingSubmissions })}</dd>
            <dt className="text-slate-500">{t('net.d.reviews')}</dt>
            <dd>{t('net.d.reviewsValue', { reviews: myData.data.reviews ?? 0, votes: myData.data.votes ?? 0 })}</dd>
            <dt className="text-slate-500">{t('net.d.status')}</dt>
            <dd>{t(myData.data.status === 'active' ? 'net.d.active' : 'net.d.blocked')}</dd>
            <dd className="col-span-2 pt-2 text-xs text-slate-500">{t('net.d.nothingMore')}</dd>
          </dl>
        ) : (
          <p className="text-sm text-rose-700 dark:text-rose-300">{myData.message}</p>
        ))}
      {leaveMsg && <p className="text-sm">{leaveMsg}</p>}

      <dialog
        ref={leaveRef}
        className="w-[min(28rem,calc(100vw-2rem))] rounded-2xl bg-white p-6 text-slate-900 shadow-2xl backdrop:bg-slate-950/60 dark:bg-slate-900 dark:text-slate-100"
      >
        <h3 className="text-lg font-bold">{t('net.leaveTitle')}</h3>
        <p className="mt-2">{t('net.leaveText')}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className="btn-primary bg-rose-600 hover:bg-rose-700" disabled={busy} onClick={() => void leave()}>
            {t(busy ? 'net.deleting' : 'net.leaveConfirm')}
          </button>
          <button type="button" className="btn-secondary" onClick={() => leaveRef.current?.close()}>
            {t('common.cancel')}
          </button>
        </div>
      </dialog>
    </section>
  );
}

export function SettingsPage() {
  const { theme, setTheme, lang, setLang, stats, update, network, info, refreshStats } = useApp();
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
        setTokenMsg({ ok: true, text: t('token.saved') });
        setSettings(await window.api.getSettings());
      } else setTokenMsg({ ok: false, text: res.message });
    } finally {
      setBusy(false);
    }
  };

  const themes: { value: ThemeSetting; label: string }[] = [
    { value: 'system', label: t('theme.system') },
    { value: 'light', label: t('theme.light') },
    { value: 'dark', label: t('theme.dark') },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 pb-20 pt-8">
      <h1 className="text-3xl font-extrabold tracking-tight">{t('settings.title')}</h1>

      <NetworkSection />

      {!network?.member && (
        <section className="card">
          <h2 className="text-lg font-bold">{t('token.title')}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {t('token.lead')}{' '}
            <button type="button" className="text-brand-700 underline dark:text-brand-300" onClick={() => void window.api.openExternal(TOKEN_HELP_URL)}>
              {t('token.create')}
            </button>
          </p>
          {settings?.hasOwnToken ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
                {t('token.isSaved')}
              </span>
              <button type="button" className="btn-secondary" onClick={() => void window.api.clearToken().then(setSettings)}>
                {t('token.remove')}
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
                aria-label={t('token.aria')}
              />
              <button type="submit" className="btn-primary" disabled={!token.trim() || busy || !settings?.encryptionAvailable}>
                {t(busy ? 'common.checking' : 'common.save')}
              </button>
            </form>
          )}
          {settings && !settings.encryptionAvailable && (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">{t('token.noEncryption')}</p>
          )}
          {tokenMsg && <p className={`mt-2 text-sm ${tokenMsg.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>{tokenMsg.text}</p>}
        </section>
      )}

      <section className="card space-y-4">
        <h2 className="text-lg font-bold">{t('db.title')}</h2>
        {settings && (
          <Toggle
            checked={settings.autoUpdate}
            label={t('db.auto')}
            onChange={(on) => {
              setSettings({ ...settings, autoUpdate: on });
              void window.api.setAutoUpdate(on);
            }}
          />
        )}
        <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-1.5 text-sm">
          <dt className="text-slate-500 dark:text-slate-400">{t('db.projects')}</dt>
          <dd>{stats ? formatCount(stats.count) : '…'}</dd>
          <dt className="text-slate-500 dark:text-slate-400">{t('db.size')}</dt>
          <dd>{stats ? formatBytes(stats.sizeBytes) : '…'}</dd>
          <dt className="text-slate-500 dark:text-slate-400">{t('about.dataDate')}</dt>
          <dd>{formatDate(stats?.dataDate)}</dd>
          <dt className="text-slate-500 dark:text-slate-400">{t('about.baseVersion')}</dt>
          <dd>{formatDate(stats?.baseVersion)}</dd>
          <dt className="text-slate-500 dark:text-slate-400">{t('db.lastCheck')}</dt>
          <dd>{stats?.lastUpdateCheck ? formatDateTime(stats.lastUpdateCheck) : t('db.never')}</dd>
          <dt className="text-slate-500 dark:text-slate-400">{t('db.applied')}</dt>
          <dd>
            {stats?.appliedDeltas.length
              ? t('db.appliedValue', { count: stats.appliedDeltas.length, date: formatDate(stats.appliedDeltas.at(-1)) })
              : t('db.none')}
          </dd>
        </dl>
        {update?.running && <p className="text-sm text-brand-700 dark:text-brand-300">{progressText(update)}</p>}
        <div className="flex flex-wrap gap-2">
          {update?.running && update.job === 'manual' ? (
            <button type="button" className="btn-secondary" onClick={() => void window.api.updatePause()}>
              {t('db.pause')}
            </button>
          ) : (
            <button type="button" className="btn-primary" disabled={update?.running} onClick={() => void window.api.updateNow()}>
              {t(update?.paused ? 'status.resume' : 'status.updateNow')}
            </button>
          )}
          <button type="button" className="btn-secondary" disabled={update?.running} onClick={() => void window.api.vacuum()}>
            {t('db.vacuum')}
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-bold">{t('common.language')}</h2>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={t('common.language')}>
          {LANGS.map((l) => (
            <button key={l} type="button" role="radio" lang={l} aria-checked={lang === l} aria-pressed={lang === l} className="chip-toggle" onClick={() => setLang(l)}>
              {LANG_NAMES[l]}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-bold">{t('appearance.title')}</h2>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={t('appearance.aria')}>
          {themes.map((t) => (
            <button key={t.value} type="button" role="radio" aria-checked={theme === t.value} aria-pressed={theme === t.value} className="chip-toggle" onClick={() => setTheme(t.value)}>
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {info?.isDev && (
        <section className="card border-dashed">
          <h2 className="text-lg font-bold">{t('dev.title')}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => void window.api.devResetCheck().then(refreshStats)}>
              {t('dev.resetCheck')}
            </button>
            <button type="button" className="btn-secondary" onClick={() => void window.api.devShowConsent()}>
              {t('dev.showConsent')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
