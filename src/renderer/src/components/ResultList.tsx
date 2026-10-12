import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RepoResult, SearchParams } from '@shared/types';
import { formatCount } from '../lib/format';
import { useApp } from '../state';
import { RepoCard } from './RepoCard';

const PAGE = 50;

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

  const hasMore = items.length < total;
  const virtualizer = useWindowVirtualizer({
    count: items.length + (hasMore ? 1 : 0),
    estimateSize: () => 118,
    overscan: 8,
    scrollMargin: margin,
    gap: 10,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const last = virtualItems.at(-1);

  useEffect(() => {
    if (!last || loading || !hasMore || last.index < items.length - 5) return;
    const gen = generation.current;
    setLoading(true);
    void window.api.search({ ...params, offset: items.length, limit: PAGE }).then((r) => {
      if (gen !== generation.current) return;
      setItems((prev) => [...prev, ...r.items]);
      setLoading(false);
    });
  }, [last?.index, loading, hasMore, items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400" aria-live="polite">
        {loading && items.length === 0
          ? 'Suche …'
          : total === 0
            ? 'Keine Projekte gefunden.'
            : `${capped ? 'Über ' : ''}${formatCount(total)} ${total === 1 ? 'Projekt' : 'Projekte'}${tookMs !== null ? ` · ${tookMs} ms` : ''}`}
      </p>
      <div ref={listRef} style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualItems.map((v) => (
          <div
            key={v.key}
            data-index={v.index}
            ref={virtualizer.measureElement}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${v.start - virtualizer.options.scrollMargin}px)` }}
          >
            {v.index < items.length ? (
              <RepoCard repo={items[v.index]} />
            ) : (
              <div className="py-4 text-center text-sm text-slate-500">Lade weitere …</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
