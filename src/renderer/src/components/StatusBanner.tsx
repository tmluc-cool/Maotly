import { formatDate, formatDateTime } from '../lib/format';
import { useApp } from '../state';

/** Discreet hint when we fall back to cached data. */
export function StatusBanner() {
  const { status, snapshotDate } = useApp();
  if (!status || status.kind === 'ok') return null;
  const date = formatDate(status.dataDate ?? snapshotDate);
  const text =
    status.kind === 'offline'
      ? `Offline – Daten vom ${date}`
      : `GitHub-Limit erreicht, Daten vom ${date}`;
  const extra =
    status.kind === 'ratelimited' && status.resetAt
      ? `Neue Daten ab ${formatDateTime(status.resetAt)}. Mit eigenem GitHub-Token in den Einstellungen gibt es viel mehr Anfragen.`
      : status.kind === 'offline'
        ? 'Die App funktioniert weiter mit den gespeicherten Daten.'
        : undefined;
  return (
    <div
      role="status"
      title={extra}
      className="flex items-center gap-2 rounded-full bg-slate-200/70 px-3 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300"
    >
      <span className={`h-2 w-2 rounded-full ${status.kind === 'offline' ? 'bg-slate-500' : 'bg-amber-500'}`} />
      {text}
    </div>
  );
}
