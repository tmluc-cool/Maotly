import type { AppUpdateInfo } from '@shared/types';
import { t } from '../lib/i18n';
import { UpdateIcon } from './icons';

/** Top right, only while a new app version exists: one click installs it (Moatly restarts by itself). */
export function AppUpdateButton({ update }: { update: AppUpdateInfo }) {
  const busy = update.phase === 'downloading' || update.phase === 'installing';
  const label =
    update.phase === 'downloading'
      ? t('appUpdate.downloading', { percent: update.progress ?? 0 })
      : update.phase === 'installing'
        ? t('appUpdate.installing')
        : t('appUpdate.button');
  const title =
    update.phase === 'error'
      ? t('appUpdate.failedTitle', { error: update.error ?? '' })
      : t(update.canInstall ? 'appUpdate.installTitle' : 'appUpdate.downloadTitle', { version: update.version });

  return (
    <button
      type="button"
      disabled={busy}
      title={title}
      onClick={() => void window.api.installAppUpdate()}
      className={`relative inline-flex items-center gap-1.5 overflow-hidden rounded-lg px-3 py-1.5 text-sm font-semibold tabular-nums text-white shadow-sm transition disabled:cursor-default ${
        update.phase === 'error' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-brand-600 hover:bg-brand-700 disabled:hover:bg-brand-600'
      }`}
    >
      {update.phase === 'downloading' && (
        <span className="absolute inset-y-0 left-0 bg-white/25 transition-[width]" style={{ width: `${update.progress ?? 0}%` }} aria-hidden />
      )}
      <UpdateIcon className={`relative ${busy ? 'animate-spin' : ''}`} />
      <span className="relative" aria-live="polite">
        {label}
      </span>
    </button>
  );
}
