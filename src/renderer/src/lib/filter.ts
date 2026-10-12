import type { Alternative, Level, Platform, RepoEntry } from '@shared/types';
import { maintenance } from './format';

export type SortKey = 'stars' | 'updated';

export interface FilterOptions {
  /** Empty = all platforms. */
  platforms: Platform[];
  /** Empty = all levels. */
  levels: Level[];
  onlyActive: boolean;
  sort: SortKey;
}

export interface FilterResult {
  visible: Alternative[];
  hidden: number;
}

export function matchesFilter(
  alt: Alternative,
  entry: RepoEntry | undefined,
  opts: Pick<FilterOptions, 'platforms' | 'levels' | 'onlyActive'>,
  now: number,
): boolean {
  if (opts.platforms.length > 0 && !alt.platforms.some((p) => opts.platforms.includes(p))) return false;
  if (opts.levels.length > 0 && !opts.levels.includes(alt.level)) return false;
  // "Aktiv gepflegt" = not red. Unknown (no data yet) is kept, so nothing disappears offline.
  if (opts.onlyActive && maintenance(entry?.stats, now) === 'red') return false;
  return true;
}

export function filterAndSort(
  alternatives: Alternative[],
  entries: Record<string, RepoEntry>,
  opts: FilterOptions,
  now: number = Date.now(),
): FilterResult {
  const visible = alternatives.filter((a) => matchesFilter(a, entries[a.repo], opts, now));
  const stars = (a: Alternative) => entries[a.repo]?.stats.stars ?? -1;
  const pushed = (a: Alternative) => {
    const t = Date.parse(entries[a.repo]?.stats.pushedAt ?? '');
    return Number.isNaN(t) ? -1 : t;
  };
  const sorted = [...visible].sort((a, b) => {
    const diff = opts.sort === 'stars' ? stars(b) - stars(a) : pushed(b) - pushed(a);
    return diff !== 0 ? diff : stars(b) - stars(a);
  });
  return { visible: sorted, hidden: alternatives.length - visible.length };
}

export function detectPlatform(userAgent: string): Platform {
  if (/Windows/i.test(userAgent)) return 'windows';
  if (/Mac OS X|Macintosh/i.test(userAgent)) return 'mac';
  return 'linux';
}
