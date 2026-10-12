import { describe, expect, it } from 'vitest';
import {
  CACHE_MAX_AGE_MS, isStale, mergeStats, oldestDataDate, parseCache, reposNeedingRefresh,
} from '../src/shared/cache';
import type { RepoStats, Snapshot } from '../src/shared/types';

const s = (stars: number, pushedAt: string | null = '2026-01-01T00:00:00Z'): RepoStats => ({
  stars, pushedAt, license: null, description: null, homepage: null, archived: false, topics: [], latestRelease: null,
});
const NOW = Date.parse('2026-10-12T12:00:00Z');
const snapshot: Snapshot = {
  generatedAt: '2026-10-01T00:00:00Z',
  repos: { 'a/a': s(1), 'b/b': s(2), 'c/c': s(3, null) },
};

describe('parseCache', () => {
  it('handles missing, broken and foreign files', () => {
    expect(parseCache(null).repos).toEqual({});
    expect(parseCache('{not json').repos).toEqual({});
    expect(parseCache('{"version":2,"repos":{}}').repos).toEqual({});
    expect(parseCache('[]').repos).toEqual({});
  });
  it('drops invalid entries', () => {
    const raw = JSON.stringify({
      version: 1,
      repos: { 'ok/ok': { stats: s(5), fetchedAt: '2026-10-10T00:00:00Z' }, 'bad/date': { stats: s(1), fetchedAt: 'nope' }, 'no/stats': { fetchedAt: '2026-10-10T00:00:00Z' } },
    });
    expect(Object.keys(parseCache(raw).repos)).toEqual(['ok/ok']);
  });
});

describe('mergeStats', () => {
  it('prefers newer cache entries over the snapshot', () => {
    const merged = mergeStats(snapshot, {
      version: 1,
      repos: {
        'a/a': { stats: s(100), fetchedAt: '2026-10-05T00:00:00Z' },
        'b/b': { stats: s(200), fetchedAt: '2026-09-01T00:00:00Z' },
        'x/new': { stats: s(7), fetchedAt: '2026-10-05T00:00:00Z' },
      },
    });
    expect(merged['a/a'].stats.stars).toBe(100);
    expect(merged['a/a'].source).toBe('cache');
    expect(merged['b/b'].stats.stars).toBe(2);
    expect(merged['b/b'].source).toBe('snapshot');
    expect(merged['x/new'].stats.stars).toBe(7);
  });
});

describe('staleness', () => {
  it('is stale after 24 hours', () => {
    expect(isStale(new Date(NOW - CACHE_MAX_AGE_MS + 1000).toISOString(), NOW)).toBe(false);
    expect(isStale(new Date(NOW - CACHE_MAX_AGE_MS - 1000).toISOString(), NOW)).toBe(true);
    expect(isStale(null, NOW)).toBe(true);
    expect(isStale('garbage', NOW)).toBe(true);
  });

  it('only refreshes stale, missing or incomplete repos', () => {
    const merged = mergeStats(snapshot, {
      version: 1,
      repos: { 'a/a': { stats: s(1), fetchedAt: new Date(NOW - 1000).toISOString() } },
    });
    expect(reposNeedingRefresh(['a/a', 'b/b', 'c/c', 'z/missing', 'a/a'], merged, NOW)).toEqual(['b/b', 'c/c', 'z/missing']);
  });

  it('finds the oldest data date', () => {
    const merged = mergeStats(snapshot, { version: 1, repos: { 'a/a': { stats: s(1), fetchedAt: '2026-10-10T00:00:00.000Z' } } });
    expect(oldestDataDate(['a/a'], merged)).toBe('2026-10-10T00:00:00.000Z');
    expect(oldestDataDate(['a/a', 'b/b'], merged)).toBe('2026-10-01T00:00:00.000Z');
    expect(oldestDataDate(['nope/nope'], merged)).toBeNull();
  });
});
