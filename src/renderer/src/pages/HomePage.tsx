import { useEffect, useState } from 'react';
import type { RepoResult } from '@shared/types';
import { RepoCard } from '../components/RepoCard';
import { SearchBox } from '../components/SearchBox';
import { data, POPULAR_IDS, POPULAR_LABELS, productsInCategory } from '../lib/data';
import { rich, t, tn, tx } from '../lib/i18n';
import { href } from '../lib/router';
import { useApp } from '../state';

export function HomePage() {
  const { dataVersion } = useApp();
  const [newest, setNewest] = useState<RepoResult[]>([]);
  useEffect(() => {
    void window.api.newlyDiscovered().then(setNewest);
  }, [dataVersion]);

  return (
    <div className="mx-auto max-w-4xl px-6 pb-16 pt-12">
      <section className="text-center">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          {rich('home.title', { em: <span className="text-brand-600 dark:text-brand-400">{t('home.titleEm')}</span> })}
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-600 dark:text-slate-400">
          {t('home.lead')}
        </p>
        <div className="mx-auto mt-8 max-w-2xl text-left">
          <SearchBox size="large" autoFocus />
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <span className="py-1.5 text-sm text-slate-500 dark:text-slate-400">{t('home.popular')}</span>
          {POPULAR_IDS.map((id) => (
            <a key={id} href={href.product(id)} className="chip">
              {POPULAR_LABELS[id]}
            </a>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="mb-4 text-xl font-bold">{t('home.categories')}</h2>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {data.categories.map((c) => {
            const count = productsInCategory(c.id).length;
            return (
              <li key={c.id}>
                <a
                  href={href.category(c.id)}
                  className="block h-full rounded-xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-600"
                >
                  <span className="block font-semibold">{tx(c.name)}</span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {tn('home.products', count)}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </section>

      {newest.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-1 text-xl font-bold">{t('home.newTitle')}</h2>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{t('home.newLead')}</p>
          <div className="space-y-2.5">
            {newest.map((r) => (
              <RepoCard key={r.id} repo={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
