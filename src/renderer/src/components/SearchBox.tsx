import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { categoryById, productSearch } from '../lib/data';
import { t, tn, tx } from '../lib/i18n';
import { href, navigate } from '../lib/router';
import { SearchIcon } from './icons';

interface Props {
  size?: 'large' | 'small';
  autoFocus?: boolean;
  initialValue?: string;
  /** Keep the text after searching (search page). */
  keepText?: boolean;
}

export function SearchBox({ size = 'large', autoFocus = false, initialValue = '', keepText = false }: Props) {
  const [query, setQuery] = useState(initialValue);
  const [open, setOpen] = useState(false);
  // -1 = nothing selected: Enter starts the full-text search.
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const results = useMemo(() => productSearch.search(query, 8), [query]);
  const trimmed = query.trim();
  // Last option: full-text search over all projects.
  const optionCount = results.length + (trimmed.length >= 2 ? 1 : 0);

  useEffect(() => setActive(-1), [query]);
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const choose = (index: number) => {
    setOpen(false);
    if (index < results.length) {
      if (!keepText) setQuery('');
      navigate(href.product(results[index].id));
    } else if (trimmed.length >= 1) {
      if (!keepText) setQuery('');
      navigate(href.search(trimmed));
    }
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (optionCount ? (a + 1) % optionCount : -1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (optionCount ? (a <= 0 ? optionCount - 1 : a - 1) : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && active >= 0) choose(active);
      else if (trimmed) choose(results.length);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const large = size === 'large';
  const showList = open && trimmed.length >= 2;

  return (
    <div className="relative w-full">
      <div className="relative">
        <SearchIcon
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400 ${large ? 'left-5' : 'left-3'}`}
          width={large ? 24 : 16}
          height={large ? 24 : 16}
        />
        <input
          ref={inputRef}
          data-search-input
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          aria-label={t('searchBox.placeholder')}
          placeholder={large ? t('searchBox.placeholder') : t('searchBox.placeholderSmall')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoComplete="off"
          className={
            large
              ? 'w-full rounded-2xl border-2 border-slate-200 bg-white py-4 pl-14 pr-5 text-xl shadow-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900'
              : 'w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900'
          }
        />
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-2 max-h-96 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          {results.map((p, i) => (
            <li
              key={p.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={active === i}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 ${
                active === i ? 'bg-brand-50 dark:bg-brand-900/40' : ''
              }`}
            >
              <span className="font-medium">{p.name}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {tx(categoryById.get(p.category)?.name)} · {tn('searchBox.alternatives', p.alternatives.length)}
              </span>
            </li>
          ))}
          <li
            id={`${listId}-${results.length}`}
            role="option"
            aria-selected={active === results.length}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => choose(results.length)}
            onMouseEnter={() => setActive(results.length)}
            className={`cursor-pointer rounded-lg px-3 py-2 text-sm text-slate-600 dark:text-slate-300 ${
              active === results.length ? 'bg-brand-50 dark:bg-brand-900/40' : ''
            }`}
          >
            <span className="font-medium text-brand-700 dark:text-brand-300">{t('searchBox.searchAll', { q: trimmed })}</span>
            <span className="ml-2 text-xs text-slate-400">Enter</span>
          </li>
        </ul>
      )}
    </div>
  );
}
