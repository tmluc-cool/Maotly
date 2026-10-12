import { useEffect, useMemo, useState } from 'react';
import { LEVELS, PLATFORMS, type Level, type Platform } from '@shared/types';
import { AlternativeCard } from '../components/AlternativeCard';
import { LEVEL_HELP, LEVEL_LABEL, PLATFORM_HELP, PLATFORM_LABEL } from '../components/badges';
import { InfoIcon } from '../components/icons';
import { categoryById, productById } from '../lib/data';
import { detectPlatform, filterAndSort, type SortKey } from '../lib/filter';
import { href } from '../lib/router';
import { useApp } from '../state';
import { NotFoundPage } from './NotFoundPage';

const OWN_PLATFORM = detectPlatform(navigator.userAgent);

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function ProductPage({ id }: { id: string }) {
  const product = productById.get(id);
  const { entries, refreshRepos, refreshing } = useApp();
  const [platforms, setPlatforms] = useState<Platform[]>([OWN_PLATFORM]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [onlyActive, setOnlyActive] = useState(false);
  const [sort, setSort] = useState<SortKey>('stars');

  useEffect(() => {
    setPlatforms([OWN_PLATFORM]);
    setLevels([]);
    setOnlyActive(false);
    if (product) void refreshRepos(product.alternatives.map((a) => a.repo));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const result = useMemo(
    () => (product ? filterAndSort(product.alternatives, entries, { platforms, levels, onlyActive, sort }) : null),
    [product, entries, platforms, levels, onlyActive, sort],
  );

  if (!product || !result) return <NotFoundPage />;
  const category = categoryById.get(product.category);
  const resetFilters = () => {
    setPlatforms([]);
    setLevels([]);
    setOnlyActive(false);
  };

  return (
    <div className="mx-auto max-w-6xl px-6 pb-16 pt-8">
      <nav className="text-sm text-slate-500 dark:text-slate-400">
        <a href={href.home()} className="hover:underline">
          Start
        </a>
        {category && (
          <>
            {' / '}
            <a href={href.category(category.id)} className="hover:underline">
              {category.name}
            </a>
          </>
        )}
      </nav>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
        Gratis statt <span className="text-brand-600 dark:text-brand-400">{product.name}</span>
      </h1>
      <p className="mt-1 text-slate-600 dark:text-slate-400">
        {product.alternatives.length} kostenlose {product.alternatives.length === 1 ? 'Alternative' : 'Alternativen'}
        {refreshing && <span className="ml-2 text-xs text-slate-400">· aktualisiere Daten von GitHub …</span>}
      </p>

      {product.note && (
        <p className="mt-4 flex gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sky-900 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-100">
          <InfoIcon className="mt-1 shrink-0" />
          <span>{product.note}</span>
        </p>
      )}

      <section aria-label="Filter" className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-28 text-sm font-medium text-slate-600 dark:text-slate-400">Plattform</span>
          {PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={platforms.includes(p)}
              title={PLATFORM_HELP[p]}
              className="chip-toggle"
              onClick={() => setPlatforms((l) => toggle(l, p))}
            >
              {PLATFORM_LABEL[p]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-28 text-sm font-medium text-slate-600 dark:text-slate-400">Schwierigkeit</span>
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={levels.includes(l)}
              title={LEVEL_HELP[l]}
              className="chip-toggle"
              onClick={() => setLevels((list) => toggle(list, l))}
            >
              {LEVEL_LABEL[l]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <span className="relative inline-flex">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={onlyActive}
                onChange={(e) => setOnlyActive(e.target.checked)}
              />
              <span className="h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-brand-500 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40 dark:bg-slate-700" />
              <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
            </span>
            Nur aktiv gepflegt
          </label>
          <label className="flex items-center gap-2 text-sm">
            Sortieren nach
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="stars">Sterne</option>
              <option value="updated">Zuletzt aktualisiert</option>
            </select>
          </label>
        </div>
      </section>

      {result.hidden > 0 && (
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
          {result.hidden} {result.hidden === 1 ? 'weitere Alternative ist' : 'weitere Alternativen sind'} durch die Filter
          ausgeblendet.{' '}
          <button type="button" className="font-medium text-brand-700 underline dark:text-brand-300" onClick={resetFilters}>
            Alle anzeigen
          </button>
        </p>
      )}

      {result.visible.length > 0 ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {result.visible.map((alt) => (
            <AlternativeCard key={alt.repo} alt={alt} entry={entries[alt.repo]} />
          ))}
        </div>
      ) : (
        <p className="mt-8 rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-600 dark:border-slate-700 dark:text-slate-400">
          Keine Alternative passt zu diesen Filtern.
        </p>
      )}
    </div>
  );
}
