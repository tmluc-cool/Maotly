import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RepoResult, SearchParams } from '@shared/types';
import { formatCount } from '../lib/format';
import { t, tn } from '../lib/i18n';
import { useApp } from '../state';
import { RepoCard } from './RepoCard';

const PAGE = 50;
/** From this list width on, results are shown in two columns (big screens, maximised window). */
const TWO_COLUMNS = 1240;

export interface ListInfo {
  total: number;
  capped: boolean;
  loading: boolean;
}

interface Props {
  params: Omit<SearchParams, 'offset' | 'limit'>;
  onInfo?: (info: ListInfo) => void;
  /** Changes force a reload (e.g. after a live search stored new projects). */
  reloadKey?: number;
}

/** Virtualised, endlessly loading list of database results. */
export function ResultList({ params, onInfo, reloadKey = 0 }: Props) {
  const { dataVersion } = useApp();
  const [items, setItems] = useState<RepoResult[]>([]);
  const [total, setTotal] = useState(0);
  const [capped, setCapped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tookMs, setTookMs] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [margin, setMargin] = useState(0);
  const [cols, setCols] = useState(1);
  const key = JSON.stringify(params);
  const generation = useRef(0);

  useEffect(() => {
    const gen = ++generation.current;
    setLoading(true);
    void window.api.search({ ...params, offset: 0, limit: PAGE }).then((r) => {
      if (gen !== generation.current) return;
      setItems(r.items);
      setTotal(r.total);
      setCapped(r.capped);
      setTookMs(r.tookMs);
      setLoading(false);
    });
  }, [key, dataVersion, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => onInfo?.({ total, capped, loading }), [total, capped, loading, onInfo]);

  useLayoutEffect(() => {
    setMargin(listRef.current?.offsetTop ?? 0);
  });

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => setCols(el.clientWidth >= TWO_COLUMNS ? 2 : 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The list is virtualised by rows; each row holds `cols` projects.
  const hasMore = items.length < total;
  const rows = Math.ceil(items.length / cols);
  const getItemKey = useCallback((index: number) => `${cols}:${index}`, [cols]);
  const virtualizer = useWindowVirtualizer({
    count: rows + (hasMore ? 1 : 0),
    estimateSize: () => 118,
    overscan: 6,
    scrollMargin: margin,
    gap: 10,
    getItemKey,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const last = virtualItems.at(-1);

  useEffect(() => {
    if (!last || loading || !hasMore || last.index < rows - 4) return;
    const gen = generation.current;
    setLoading(true);
    void window.api.search({ ...params, offset: items.length, limit: PAGE }).then((r) => {
      if (gen !== generation.current) return;
      setItems((prev) => [...prev, ...r.items]);
      setLoading(false);
    });
  }, [last?.index, loading, hasMore, items.length, rows]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400" aria-live="polite">
        {loading && items.length === 0
          ? t('results.searching')
          : total === 0
            ? t('results.none')
            : `${capped ? t('results.capped', { count: formatCount(total) }) : tn('common.projects', total)}${tookMs !== null ? ` · ${tookMs} ms` : ''}`}
      </p>
      <div ref={listRef} style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualItems.map((v) => (
          <div
            key={v.key}
            data-index={v.index}
            ref={virtualizer.measureElement}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${v.start - virtualizer.options.scrollMargin}px)` }}
          >
            {v.index < rows ? (
              <div className={cols > 1 ? 'grid grid-cols-2 gap-2.5' : undefined}>
                {items.slice(v.index * cols, (v.index + 1) * cols).map((repo) => (
                  <RepoCard key={repo.id} repo={repo} />
                ))}
              </div>
            ) : (
              <div className="py-4 text-center text-sm text-slate-500">{t('results.loadingMore')}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
