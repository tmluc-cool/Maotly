import { useEffect, useRef, useState } from 'react';
import { t } from '../lib/i18n';
import { useApp } from '../state';
import { UserIcon } from './icons';

/** "Sign in with GitHub" (device flow): explanation, then the code to enter on github.com. */
export function SignInDialog() {
  const { account, signInOpen, setSignInOpen } = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  const [started, setStarted] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (signInOpen && !d.open) d.showModal();
    if (!signInOpen && d.open) d.close();
    if (signInOpen) setStarted(false);
  }, [signInOpen]);

  if (!account) return null;
  const flow = account.flow;

  const close = () => {
    if (flow.state !== 'idle') void window.api.githubCancel();
    setSignInOpen(false);
  };
  const start = () => {
    setStarted(true);
    setCopied(false);
    void window.api.githubSignIn();
  };
  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      /* the code can still be typed */
    }
  };

  return (
    <dialog
      ref={ref}
      className="w-[min(32rem,calc(100vw-2rem))] rounded-2xl bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/60 dark:bg-slate-900 dark:text-slate-100"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      aria-labelledby="signin-title"
    >
      <div className="space-y-4 p-7">
        <h2 id="signin-title" className="flex items-center gap-2 text-xl font-extrabold">
          <UserIcon width={22} height={22} /> {t('account.signIn')}
        </h2>

        {account.login && started ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100">
            {t('account.done', { login: account.login })}
          </p>
        ) : flow.state === 'waiting' ? (
          <div className="space-y-4">
            <p>{t('consent.step1')}</p>
            <p className="select-all rounded-xl bg-slate-100 py-4 text-center font-mono text-3xl font-bold tracking-widest dark:bg-slate-800">
              {flow.info.userCode}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary" onClick={() => void window.api.openExternal(flow.info.verificationUri)}>
                {t('consent.openGitHub')}
              </button>
              <button type="button" className="btn-secondary" onClick={() => void copy(flow.info.userCode)}>
                {copied ? t('account.copied') : t('account.copy')}
              </button>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">{t('consent.step2')}</p>
          </div>
        ) : flow.state === 'checking' ? (
          <p>{t('account.checking')}</p>
        ) : (
          <>
            <p className="text-slate-700 dark:text-slate-300">{t('account.lead')}</p>
            {flow.state === 'error' && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/50 dark:text-rose-200">{flow.message}</p>
            )}
            <button type="button" className="btn-primary" onClick={start}>
              {flow.state === 'error' ? t('account.tryAgain') : t('account.signIn')}
            </button>
          </>
        )}

        <div className="flex justify-end">
          <button type="button" className="text-sm underline" onClick={close}>
            {account.login && started ? t('common.close') : t('common.cancel')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
