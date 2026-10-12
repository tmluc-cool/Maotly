import { PLATFORMS, type SortKey, type UpdatedWithin } from '@shared/types';
import { data } from '../lib/data';
import type { Filters } from '../lib/router';
import { PLATFORM_LABEL } from './badges';

interface Props {
  filters: Filters;
  onChange(f: Filters): void;
  showCategory?: boolean;
  hasText: boolean;
}

const select =
  'rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800';

export function FilterBar({ filters, onChange, showCategory = true, hasText }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const sort = filters.sort ?? (hasText ? 'relevance' : 'stars');
  const active =
    filters.category || filters.platform || filters.minStars || filters.updatedWithin !== 'any' || filters.licensed || filters.activeOnly;
  return (
    <section
      aria-label="Filter und Sortierung"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-900"
    >
      {showCategory && (
        <label className="flex items-center gap-1.5">
          Kategorie
          <select className={select} value={filters.category ?? ''} onChange={(e) => set({ category: e.target.value || null })}>
            <option value="">alle</option>
            {data.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex items-center gap-1.5">
        Plattform
        <select
          className={select}
          value={filters.platform ?? ''}
          onChange={(e) => set({ platform: (e.target.value || null) as Filters['platform'] })}
        >
          <option value="">alle</option>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABEL[p]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5">
        Mind. Sterne
        <select className={select} value={filters.minStars} onChange={(e) => set({ minStars: Number(e.target.value) })}>
          {[0, 100, 500, 1000, 5000, 10000].map((n) => (
            <option key={n} value={n}>
              {n === 0 ? 'egal' : n.toLocaleString('de-CH')}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5">
        Aktualisiert innerhalb
        <select
          className={select}
          value={filters.updatedWithin}
          onChange={(e) => set({ updatedWithin: e.target.value as UpdatedWithin })}
        >
          <option value="6m">6 Monaten</option>
          <option value="1y">1 Jahr</option>
          <option value="2y">2 Jahren</option>
          <option value="any">egal</option>
        </select>
      </label>
      <label className="flex cursor-pointer items-center gap-1.5">
        <input type="checkbox" checked={filters.licensed} onChange={(e) => set({ licensed: e.target.checked })} />
        Nur mit Lizenz
      </label>
      <label className="flex cursor-pointer items-center gap-1.5">
        <input type="checkbox" checked={filters.activeOnly} onChange={(e) => set({ activeOnly: e.target.checked })} />
        Nur aktiv gepflegt
      </label>
      <label className="ml-auto flex items-center gap-1.5">
        Sortieren nach
        <select className={select} value={sort} onChange={(e) => set({ sort: e.target.value as SortKey })}>
          {hasText && <option value="relevance">Relevanz</option>}
          <option value="stars">Sterne</option>
          <option value="updated">Zuletzt aktualisiert</option>
          <option value="new">Neu entdeckt</option>
        </select>
      </label>
      {active && (
        <button
          type="button"
          className="text-brand-700 underline dark:text-brand-300"
          onClick={() => onChange({ ...filters, category: showCategory ? null : filters.category, platform: null, minStars: 0, updatedWithin: 'any', licensed: false, activeOnly: false })}
        >
          Filter zurücksetzen
        </button>
      )}
    </section>
  );
}
