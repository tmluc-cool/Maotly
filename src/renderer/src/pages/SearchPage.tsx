import { useEffect, useMemo, useState } from 'react';
import type { LiveSearchResult } from '@shared/types';
import { SearchBox } from '../components/SearchBox';
import { CodeIcon, StarIcon, WarningIcon } from '../components/icons';
import { productSearch } from '../lib/data';
import { formatDateTime, formatStars, relativeTime } from '../lib/format';
import { href } from '../lib/router';

export function SearchPage({ query }: { query: string }) {
  const [result, setResult] = useState<LiveSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const suggestions = useMemo(() => productSearch.search(query, 5), [query]);

  useEffect(() => {
    setResult(null);
    setLoading(false);
  }, [query]);

  const runLive = async () => {
    setLoading(true);
    try {
      setResult(await window.api.searchLive(query));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-6 pb-16 pt-8">
      <div className="max-w-2xl">
        <SearchBox size="large" initialValue={query} key={query} />
      </div>

      <h1 className="mt-8 text-2xl font-bold">
        {query ? <>Suche nach „{query}“</> : 'Suche'}
      </h1>

      {suggestions.length > 0 ? (
        <div className="mt-3">
          <p className="text-slate-600 dark:text-slate-400">Meintest du:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((p) => (
              <a key={p.id} href={href.product(p.id)} className="chip">
                {p.name}
              </a>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Dazu haben wir noch keine geprüften Alternativen. Du kannst aber direkt auf GitHub suchen.
        </p>
      )}

      {query.trim().length >= 2 && !result && (
        <button type="button" className="btn-primary mt-6" disabled={loading} onClick={() => void runLive()}>
          <CodeIcon /> {loading ? 'Suche läuft …' : 'Live auf GitHub suchen'}
        </button>
      )}

      {result && !result.ok && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {result.reason === 'offline' && <p>Du bist offline. Die Live-Suche braucht eine Internetverbindung.</p>}
          {result.reason === 'ratelimited' && (
            <>
              <p className="font-semibold">GitHub macht gerade eine kurze Pause.</p>
              <p className="mt-1 text-sm">
                Ohne eigenen GitHub-Token erlaubt GitHub nur 10 Suchen pro Minute.
                {result.resetAt && <> Ab {formatDateTime(result.resetAt)} geht es wieder.</>} Mit einem Token (siehe{' '}
                <a href={href.settings()} className="underline">
                  Einstellungen
                </a>
                ) sind es 30 pro Minute.
              </p>
            </>
          )}
          {result.reason === 'error' && <p>Die Suche hat nicht geklappt. {result.message}</p>}
          <button type="button" className="btn-secondary mt-3" onClick={() => void runLive()}>
            Nochmals versuchen
          </button>
        </div>
      )}

      {result && result.ok && (
        <section className="mt-6">
          <p className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            <WarningIcon className="shrink-0" />
            Nicht von uns geprüft. Diese Treffer kommen direkt von GitHub – schau sie dir genau an, bevor du etwas installierst.
          </p>
          {result.hits.length === 0 ? (
            <p className="mt-4 text-slate-600 dark:text-slate-400">GitHub hat nichts Passendes gefunden.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {result.hits.map((h) => (
                <li key={h.repo} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="mr-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                        Nicht von uns geprüft
                      </span>
                      <span className="font-semibold">{h.repo}</span>
                    </div>
                    <button type="button" className="btn-secondary" onClick={() => void window.api.openExternal(h.url)}>
                      <CodeIcon /> Auf GitHub ansehen
                    </button>
                  </div>
                  {h.description && <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{h.description}</p>}
                  <p className="mt-2 flex flex-wrap gap-x-4 text-xs text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <StarIcon className="text-amber-500" width={12} height={12} /> {formatStars(h.stars)}
                    </span>
                    <span>{h.archived ? 'Archiviert' : `Zuletzt aktualisiert ${relativeTime(h.pushedAt)}`}</span>
                    {h.license && <span>Lizenz: {h.license}</span>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
