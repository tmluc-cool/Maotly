import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LiveSearchResult, RepoResult } from '@shared/types';
import { CuratedCard } from '../components/CuratedCard';
import { FilterBar } from '../components/FilterBar';
import { CodeIcon } from '../components/icons';
import { ResultList, type ListInfo } from '../components/ResultList';
import { SearchBox } from '../components/SearchBox';
import { productSearch } from '../lib/data';
import { rich, t } from '../lib/i18n';
import { href, navigate, type Filters } from '../lib/router';
import { useApp } from '../state';

const FEW_RESULTS = 10;

export function SearchPage({ q, filters }: { q: string; filters: Filters }) {
  const product = useMemo(() => productSearch.bestMatch(q), [q]);
  const [curated, setCurated] = useState<Record<string, RepoResult>>({});
  const [info, setInfo] = useState<ListInfo>({ total: 0, capped: false, loading: true });
  const [live, setLive] = useState<LiveSearchResult | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const { dataVersion, refreshStats, network } = useApp();

  useEffect(() => {
    setLive(null);
    if (product) void window.api.curated(product.alternatives.map((a) => a.repo)).then(setCurated);
  }, [product, dataVersion]);
  useEffect(() => setLive(null), [q]);

  const params = useMemo(
    () => ({
      q,
      category: filters.category,
      platform: filters.platform,
      minStars: filters.minStars,
      updatedWithin: filters.updatedWithin,
      licensed: filters.licensed,
      activeOnly: filters.activeOnly,
      sort: filters.sort ?? undefined,
    }),
    [q, filters],
  );
  const onInfo = useCallback((i: ListInfo) => setInfo(i), []);

  const runLive = async () => {
    setLiveBusy(true);
    try {
      const res = await window.api.liveSearch(q);
      setLive(res);
      if (res.ok) {
        setReloadKey((k) => k + 1);
        void refreshStats();
      }
    } finally {
      setLiveBusy(false);
    }
  };

  const showLive = q.trim().length >= 2 && !info.loading && info.total < FEW_RESULTS;

  return (
    <div className="mx-auto max-w-6xl px-6 pb-20 pt-8">
      <div className="max-w-2xl">
        <SearchBox size="large" initialValue={q} keepText key={q} />
      </div>

      {product && (
        <section className="mt-8">
          <h2 className="text-2xl font-extrabold tracking-tight">
            {rich('curated.title', { product: <span className="text-brand-600 dark:text-brand-400">{product.name}</span> })}
          </h2>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            {t('curated.picked')}{' '}
            <a className="underline" href={href.product(product.id)}>
              {t('curated.more')}
            </a>
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {product.alternatives.map((alt) => (
              <CuratedCard key={alt.repo} alt={alt} repo={curated[alt.repo]} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="mb-3 text-xl font-bold">{product ? t('search.moreProjects') : q ? t('search.projectsFor', { q }) : t('search.allProjects')}</h2>
        <FilterBar filters={filters} hasText={!!q.trim()} onChange={(f) => navigate(href.search(q, f), true)} />

        {showLive && (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t(info.total === 0 ? 'search.nothingInDb' : 'search.fewInDb')} {t('search.maybeNewer')}
            </p>
            <button type="button" className="btn-primary mt-3" disabled={liveBusy} onClick={() => void runLive()}>
              <CodeIcon /> {t(liveBusy ? 'search.liveBusy' : 'search.liveButton')}
            </button>
            {live && <LiveMessage result={live} member={!!network?.member} />}
          </div>
        )}
        {!showLive && live && <LiveMessage result={live} member={!!network?.member} />}

        <div className="mt-4">
          <ResultList params={params} onInfo={onInfo} reloadKey={reloadKey} />
        </div>
      </section>
    </div>
  );
}

function LiveMessage({ result, member }: { result: LiveSearchResult; member: boolean }) {
  if (result.ok) {
    return (
      <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">
        {result.found === 0
          ? t('live.nothing')
          : t(member && result.fresh ? 'live.foundNetwork' : 'live.found', { found: result.found, fresh: result.fresh })}
      </p>
    );
  }
  return (
    <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
      {result.reason === 'offline'
        ? t('live.offline')
        : result.reason === 'ratelimited'
          ? t('live.ratelimited', { n: result.withToken ? 30 : 10 })
          : t('live.error', { message: result.message ?? '' })}
    </p>
  );
}
