import { formatCount, formatDate } from '../lib/format';
import { useApp } from '../state';

/** Bottom bar: update progress or database size and date. */
export function StatusBar() {
  const { stats, update } = useApp();
  const running = update?.running;
  const manual = update?.job === 'manual';

  let text: string;
  if (running) text = update!.text || 'Aktualisiere …';
  else if (stats) text = `Datenbank: ${formatCount(stats.count)} Projekte · Stand ${formatDate(stats.dataDate)}`;
  else text = '';

  return (
    <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-slate-50/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-1.5 text-xs text-slate-600 dark:text-slate-400">
        {running && <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" aria-hidden />}
        <span role="status" aria-live="polite" className="truncate">
          {text}
        </span>
        {!running && update?.error && <span className="truncate text-rose-600 dark:text-rose-400">Update fehlgeschlagen: {update.error}</span>}
        <span className="ml-auto flex shrink-0 gap-2">
          {running && manual ? (
            <button type="button" className="btn-link" onClick={() => void window.api.updatePause()}>
              Pausieren
            </button>
          ) : running ? null : (
            <button type="button" className="btn-link" onClick={() => void window.api.updateNow()}>
              {update?.paused ? 'Update fortsetzen' : 'Jetzt aktualisieren'}
            </button>
          )}
        </span>
      </div>
    </footer>
  );
}
