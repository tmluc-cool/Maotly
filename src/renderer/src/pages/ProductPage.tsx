import { useEffect, useMemo, useState } from 'react';
import type { RepoResult } from '@shared/types';
import { CuratedCard } from '../components/CuratedCard';
import { InfoIcon } from '../components/icons';
import { ResultList } from '../components/ResultList';
import { categoryById, productById } from '../lib/data';
import { rich, t, tn, tx } from '../lib/i18n';
import { href } from '../lib/router';
import { useApp } from '../state';
import { NotFoundPage } from './NotFoundPage';

export function ProductPage({ id }: { id: string }) {
  const product = productById.get(id);
  const { dataVersion } = useApp();
  const [repos, setRepos] = useState<Record<string, RepoResult>>({});

  useEffect(() => {
    if (product) void window.api.curated(product.alternatives.map((a) => a.repo)).then(setRepos);
  }, [product, dataVersion]);

  // "Similar projects": anything matching the product name or one of its aliases, without the curated ones.
  const similar = useMemo(() => {
    if (!product) return null;
    const terms = [...product.aliases, ...product.name.split('/').map((s) => s.trim())].filter((t) => t.length >= 3);
    const exclude = Object.values(repos).map((r) => r.id);
    return { q: '', anyOf: terms, excludeIds: exclude, activeOnly: true };
  }, [product, repos]);

  if (!product) return <NotFoundPage />;
  const category = categoryById.get(product.category);

  return (
    <div className="mx-auto max-w-6xl px-6 pb-20 pt-8">
      <nav className="text-sm text-slate-500 dark:text-slate-400">
        <a href={href.home()} className="hover:underline">
          {t('common.home')}
        </a>
        {category && (
          <>
            {' / '}
            <a href={href.category(category.id)} className="hover:underline">
              {tx(category.name)}
            </a>
          </>
        )}
      </nav>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
        {rich('curated.title', { product: <span className="text-brand-600 dark:text-brand-400">{product.name}</span> })}
      </h1>
      <p className="mt-1 text-slate-600 dark:text-slate-400">
        {tn('curated.count', product.alternatives.length)}
      </p>

      {product.note && (
        <p className="mt-4 flex gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sky-900 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-100">
          <InfoIcon className="mt-1 shrink-0" />
          <span>{tx(product.note)}</span>
        </p>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {product.alternatives.map((alt) => (
          <CuratedCard key={alt.repo} alt={alt} repo={repos[alt.repo]} />
        ))}
      </div>

      {similar && (
        <section className="mt-12">
          <h2 className="text-xl font-bold">{t('curated.similar')}</h2>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">{t('curated.similarLead')}</p>
          <ResultList params={similar} />
        </section>
      )}
    </div>
  );
}
