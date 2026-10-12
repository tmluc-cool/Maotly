import type { UpdateStatus } from '@shared/types';
import { formatCount, formatDate } from '../lib/format';
import { t } from '../lib/i18n';
import { useApp } from '../state';

/** Status bar text for a running update. */
export function progressText(u: UpdateStatus): string {
  const counts = { added: formatCount(u.added), updated: formatCount(u.updated) };
  switch (u.phase) {
    case 'checking':
      return t('progress.checking');
    case 'packages':
      return u.of ? t('progress.packagesOf', { ...counts, index: u.index ?? 1, of: u.of }) : t('progress.packages', counts);
    case 'github':
      return t('progress.github', counts);
    case 'merge-base':
      return t('progress.mergeBase');
    case 'vacuum':
      return t('progress.vacuum');
    default:
      return t('status.updating');
  }
}

/** Bottom bar: update progress or database size and date. */
export function StatusBar() {
  const { stats, update, appUpdate } = useApp();
  const running = update?.running;
  const manual = update?.job === 'manual';

  let text: string;
  if (running) text = progressText(update!);
  else if (stats) text = t('status.db', { count: formatCount(stats.count), date: formatDate(stats.dataDate) });
  else text = '';

  return (
    <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-slate-50/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-1.5 text-xs text-slate-600 dark:text-slate-400">
        {running && <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" aria-hidden />}
        <span role="status" aria-live="polite" className="truncate">
          {text}
        </span>
        {!running && update?.error && <span className="truncate text-rose-600 dark:text-rose-400">{t('status.failed', { error: update.error })}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-3">
          {appUpdate && (
            <button
              type="button"
              className="rounded-full bg-brand-600 px-2.5 py-0.5 font-semibold text-white hover:bg-brand-700"
              onClick={() => void window.api.openExternal(appUpdate.url)}
              title={t('status.newVersionTitle')}
            >
              {t('status.newVersion', { version: appUpdate.version })}
            </button>
          )}
          {running && manual ? (
            <button type="button" className="btn-link" onClick={() => void window.api.updatePause()}>
              {t('status.pause')}
            </button>
          ) : running ? null : (
            <button type="button" className="btn-link" onClick={() => void window.api.updateNow()}>
              {t(update?.paused ? 'status.resume' : 'status.updateNow')}
            </button>
          )}
        </span>
      </div>
    </footer>
  );
}
