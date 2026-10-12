import { useEffect, useRef } from 'react';
import { LANG_NAMES, LANGS, isLang } from '@shared/i18n';
import { rich, t } from '../lib/i18n';
import { href, navigate } from '../lib/router';
import { useApp } from '../state';

/**
 * Asked once after the first start. Can only be closed with one of the two answers.
 * Both buttons look exactly the same – nothing is preselected.
 */
export function ConsentDialog() {
  const { network, lang, setLang } = useApp();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const open = !!network?.askConsent && window.location.hash !== href.privacy();

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  if (!network) return null;
  const s = network.signIn;
  const answerButton = 'w-full rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-base font-semibold text-slate-900 transition hover:border-brand-500 hover:bg-brand-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700';

  return (
    <dialog
      ref={dialogRef}
      className="w-[min(40rem,calc(100vw-2rem))] rounded-2xl bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/60 dark:bg-slate-900 dark:text-slate-100"
      onCancel={(e) => e.preventDefault()} // Esc doesn't close it: an answer is needed
      aria-labelledby="consent-title"
    >
      <div className="space-y-4 p-7">
        {/* Focus starts on the title, so neither answer looks preselected. */}
        <div className="flex items-start justify-between gap-4">
          <h2 id="consent-title" className="text-2xl font-extrabold outline-none focus-visible:ring-0" tabIndex={-1} autoFocus>
            {t('consent.title')}
          </h2>
          <select
            aria-label={t('common.language')}
            value={lang}
            onChange={(e) => isLang(e.target.value) && setLang(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
          >
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {LANG_NAMES[l]}
              </option>
            ))}
          </select>
        </div>

        {s.state === 'waiting' ? (
          <div className="space-y-4">
            <p>{t('consent.step1')}</p>
            <p className="select-all rounded-xl bg-slate-100 py-4 text-center font-mono text-3xl font-bold tracking-widest dark:bg-slate-800">
              {s.info.userCode}
            </p>
            <button type="button" className={answerButton} onClick={() => void window.api.openExternal(s.info.verificationUri)}>
              {t('consent.openGitHub')}
            </button>
            <p className="text-sm text-slate-600 dark:text-slate-400">{t('consent.step2')}</p>
            <button type="button" className="text-sm underline" onClick={() => void window.api.cancelJoin()}>
              {t('consent.cancel')}
            </button>
          </div>
        ) : s.state === 'registering' ? (
          <p>{t('consent.registering')}</p>
        ) : (
          <>
            <p>{t('consent.p1')}</p>
            <p>{rich('consent.p2', { network: <strong>{t('consent.networkName')}</strong> })}</p>
            <p>
              <strong>{t('consent.storedLabel')}</strong> {t('consent.stored')}
              <br />
              <strong>{t('consent.publicLabel')}</strong> {t('consent.public')}
              <br />
              <strong>{t('consent.notStoredLabel')}</strong> {t('consent.notStored')}
            </p>
            <p>{t('consent.change')}</p>
            {s.state === 'error' && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/50 dark:text-rose-200">{s.message}</p>
            )}
            <div className="grid gap-3 pt-2 sm:grid-cols-2">
              <button type="button" className={answerButton} onClick={() => void window.api.joinNetwork()}>
                {t('consent.join')}
              </button>
              <button
                type="button"
                className={answerButton}
                onClick={() => void (s.state === 'error' ? window.api.cancelJoin() : window.api.declineNetwork())}
              >
                {t('consent.decline')}
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <button type="button" className="underline" onClick={() => navigate(href.privacy())}>
                {t('consent.readPrivacy')}
              </button>
              <span className="text-xs text-slate-500 dark:text-slate-400">{t('consent.fun')}</span>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
