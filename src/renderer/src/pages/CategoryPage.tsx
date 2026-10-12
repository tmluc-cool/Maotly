import { useMemo } from 'react';
import { FilterBar } from '../components/FilterBar';
import { CategoryIcon } from '../components/icons';
import { ResultList } from '../components/ResultList';
import { categoryById, productsInCategory } from '../lib/data';
import { prettyRepoName } from '../lib/format';
import { t, tx } from '../lib/i18n';
import { href, navigate, type Filters } from '../lib/router';
import { NotFoundPage } from './NotFoundPage';

export function CategoryPage({ id, filters }: { id: string; filters: Filters }) {
  const category = categoryById.get(id);
  const params = useMemo(
    () => ({
      q: '',
      category: id,
      platform: filters.platform,
      minStars: filters.minStars,
      updatedWithin: filters.updatedWithin,
      licensed: filters.licensed,
      activeOnly: filters.activeOnly,
      sort: filters.sort ?? 'stars',
    }),
    [id, filters],
  );
  if (!category) return <NotFoundPage />;
  const products = productsInCategory(id);

  return (
    <div className="page pb-20 pt-8">
      <nav className="text-sm text-slate-500 dark:text-slate-400">
        <a href={href.home()} className="hover:underline">
          {t('common.home')}
        </a>
      </nav>
      <h1 className="mt-2 flex items-center gap-3 text-3xl font-extrabold tracking-tight">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
          <CategoryIcon id={id} width={24} height={24} />
        </span>
        {tx(category.name)}
      </h1>

      {products.length > 0 && (
        <>
          <p className="mt-1 text-slate-600 dark:text-slate-400">{t('category.pick')}</p>
          <ul className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {products.map((p) => (
              <li key={p.id}>
                <a
                  href={href.product(p.id)}
                  className="flex h-full items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-brand-400 dark:border-slate-800 dark:bg-slate-900"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold">{p.name}</span>
                    <span className="block truncate text-sm text-slate-500 dark:text-slate-400">
                      {t('category.free', { list: p.alternatives.map((a) => prettyRepoName(a.repo)).join(', ') })}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-0.5 text-sm font-medium text-brand-800 dark:bg-brand-900/40 dark:text-brand-200">
                    {p.alternatives.length}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      <section className="mt-10">
        <h2 className="mb-1 text-xl font-bold">{t('category.top', { category: tx(category.name) })}</h2>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">{t('category.topLead')}</p>
        <FilterBar filters={filters} showCategory={false} hasText={false} onChange={(f) => navigate(href.category(id, f), true)} />
        <div className="mt-4">
          <ResultList params={params} />
        </div>
      </section>
    </div>
  );
}
