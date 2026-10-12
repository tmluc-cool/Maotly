import { useEffect, useState } from 'react';
import type { RepoResult } from '@shared/types';
import { CategoryIcon } from '../components/icons';
import { RepoCard } from '../components/RepoCard';
import { SearchBox } from '../components/SearchBox';
import { data, POPULAR_IDS, POPULAR_LABELS, productsInCategory } from '../lib/data';
import { rich, t, tn, tx } from '../lib/i18n';
import { href } from '../lib/router';
import { useApp } from '../state';

export function HomePage() {
  const { dataVersion, stats } = useApp();
  const [newest, setNewest] = useState<RepoResult[]>([]);
  useEffect(() => {
    void window.api.newlyDiscovered().then(setNewest);
  }, [dataVersion]);

  return (
    <div className="pb-16">
      <section className="mx-auto max-w-4xl px-6 pt-12 text-center 2xl:pt-20">
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

      <div className="page">
        <section className="mt-14">
          <h2 className="mb-4 text-xl font-bold">{t('home.categories')}</h2>
          {/* 11 categories + "All projects" = 12 tiles, so 2, 3 and 4 columns all end with a full row. */}
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {data.categories.map((c) => {
              const products = productsInCategory(c.id);
              const examples = products.map((p) => p.name.split(' / ')[0]).join(', ');
              return (
                <li key={c.id}>
                  <Tile href={href.category(c.id)} icon={c.id} title={tx(c.name)} lead={examples} meta={tn('home.products', products.length)} />
                </li>
              );
            })}
            <li>
              <Tile
                href={href.search('')}
                icon="all"
                title={t('search.allProjects')}
                lead={t('home.allLead')}
                meta={stats ? tn('common.projects', stats.count) : ''}
              />
            </li>
          </ul>
        </section>

        {newest.length > 0 && (
          <section className="mt-14">
            <h2 className="mb-1 text-xl font-bold">{t('home.newTitle')}</h2>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{t('home.newLead')}</p>
            <div className="grid gap-2.5 xl:grid-cols-2">
              {newest.map((r) => (
                <RepoCard key={r.id} repo={r} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Tile({ href, icon, title, lead, meta }: { href: string; icon: string; title: string; lead: string; meta: string }) {
  return (
    <a
      href={href}
      className="group flex h-full gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-600"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 transition group-hover:bg-brand-100 dark:bg-brand-900/40 dark:text-brand-300 dark:group-hover:bg-brand-900/70">
        <CategoryIcon id={icon} width={22} height={22} />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="block truncate text-sm text-slate-600 dark:text-slate-300" title={lead}>
          {lead}
        </span>
        <span className="block text-xs text-slate-500 dark:text-slate-400">{meta}</span>
      </span>
    </a>
  );
}
