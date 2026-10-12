import type { RepoResult } from '@shared/types';
import { formatStars, isNew, maintenance, relativeTime } from '../lib/format';
import { href, navigate } from '../lib/router';
import { MaintenanceLight } from './badges';
import { RatingChip } from './Stars';
import { ExternalIcon, StarIcon } from './icons';

export function updatedText(repo: { archived: number | boolean; pushed_at: string | null }): string {
  if (repo.archived) return 'Archiviert – wird nicht mehr gepflegt';
  if (!repo.pushed_at) return 'Aktualität unbekannt';
  return `aktualisiert ${relativeTime(repo.pushed_at)}`;
}

/** One project from the database, as a compact row. Click opens GitHub in the browser. */
export function RepoCard({ repo }: { repo: RepoResult }) {
  const topics = (repo.topics ?? '').split(' ').filter(Boolean).slice(0, 5);
  const open = () => void window.api.openExternal(repo.html_url);
  return (
    <article
      className="group flex cursor-pointer gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-brand-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-600"
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter') open();
      }}
      tabIndex={0}
      role="link"
      aria-label={`${repo.full_name} auf GitHub öffnen`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h3 className="truncate text-base font-bold">{repo.name}</h3>
          <span className="truncate text-sm text-slate-500 dark:text-slate-400">von {repo.owner}</span>
          {isNew(repo) && (
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-800 dark:bg-brand-900/60 dark:text-brand-200">
              Neu
            </span>
          )}
        </div>
        {repo.description && <p className="mt-1 line-clamp-2 text-sm text-slate-700 dark:text-slate-300">{repo.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
          <span className="inline-flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-200" title={`${repo.stars} Sterne`}>
            <StarIcon className="text-amber-500" width={13} height={13} />
            {formatStars(repo.stars)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MaintenanceLight value={maintenance(repo)} />
            {updatedText(repo)}
          </span>
          <button
            type="button"
            className="rounded px-1 hover:bg-slate-100 hover:underline dark:hover:bg-slate-800"
            title="Bewertungen ansehen und schreiben"
            onClick={(e) => {
              e.stopPropagation();
              navigate(href.project(repo.id));
            }}
          >
            {repo.rating_count ? <RatingChip avg={repo.rating_avg} count={repo.rating_count} /> : 'Bewerten'}
          </button>
          {repo.license && <span>Lizenz: {repo.license}</span>}
          {repo.language && <span>{repo.language}</span>}
          {topics.map((t) => (
            <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">
              {t}
            </span>
          ))}
        </div>
      </div>
      <button
        type="button"
        className="btn-secondary h-fit shrink-0 self-center"
        onClick={(e) => {
          e.stopPropagation();
          open();
        }}
      >
        <ExternalIcon /> Auf GitHub öffnen
      </button>
    </article>
  );
}
