import type { Alternative, RepoResult } from '@shared/types';
import { formatStars, maintenance, prettyRepoName } from '../lib/format';
import { t, tx } from '../lib/i18n';
import { href, navigate } from '../lib/router';
import { LevelBadge, MaintenanceLight, PlatformList } from './badges';
import { RatingChip } from './Stars';
import { CodeIcon, ExternalIcon, StarIcon, WarningIcon } from './icons';
import { updatedText } from './RepoCard';

/** A curated alternative with its summary (in the app's language) and live data from the database. */
export function CuratedCard({ alt, repo }: { alt: Alternative; repo: RepoResult | undefined }) {
  const open = (url: string) => void window.api.openExternal(url);
  return (
    <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold">{prettyRepoName(alt.repo)}</h3>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{repo?.full_name ?? alt.repo}</p>
        </div>
        <LevelBadge level={alt.level} />
      </header>
      <p className="mt-3 text-slate-700 dark:text-slate-300">{tx(alt.summary)}</p>
      {alt.note && (
        <p className="mt-3 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
          <WarningIcon className="mt-0.5 shrink-0" />
          <span>{tx(alt.note)}</span>
        </p>
      )}
      <dl className="mt-4 grid grid-cols-[auto,1fr] items-center gap-x-3 gap-y-2 text-sm">
        <dd className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1 font-semibold">
            <StarIcon className="text-amber-500" />
            {repo ? formatStars(repo.stars) : '–'}
          </span>
          <span className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <MaintenanceLight value={maintenance(repo)} />
            {repo ? updatedText(repo) : t('curated.notInDb')}
          </span>
        </dd>
        {repo && (
          <>
            <dt className="text-slate-500 dark:text-slate-400">{t('curated.rating')}</dt>
            <dd>
              <button type="button" className="hover:underline" onClick={() => navigate(href.project(repo.id))}>
                <RatingChip avg={repo.rating_avg} count={repo.rating_count} />
              </button>
            </dd>
          </>
        )}
        <dt className="text-slate-500 dark:text-slate-400">{t('curated.license')}</dt>
        <dd>{repo?.license ?? t('common.unknown')}</dd>
        <dt className="text-slate-500 dark:text-slate-400">{t('curated.runsOn')}</dt>
        <dd>
          <PlatformList platforms={alt.platforms} />
        </dd>
      </dl>
      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        <button type="button" className="btn-primary" onClick={() => open(repo?.html_url ?? `https://github.com/${alt.repo}`)}>
          <CodeIcon /> {t('common.openOnGitHub')}
        </button>
        {repo && (
          <button type="button" className="btn-secondary" onClick={() => navigate(href.project(repo.id))}>
            {t('curated.reviews')}
          </button>
        )}
        {alt.website && (
          <button type="button" className="btn-secondary" onClick={() => open(alt.website!)}>
            <ExternalIcon /> {t('curated.website')}
          </button>
        )}
      </div>
    </article>
  );
}
