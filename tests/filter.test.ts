import { describe, expect, it } from 'vitest';
import type { Alternative, RepoEntry, RepoStats } from '../src/shared/types';
import { detectPlatform, filterAndSort, type FilterOptions } from '../src/renderer/src/lib/filter';
import { formatStars, maintenance, prettyRepoName, relativeTime } from '../src/renderer/src/lib/format';

const NOW = Date.parse('2026-10-12T12:00:00Z');
const monthsAgo = (m: number) => new Date(Date.UTC(2026, 9 - m, 12)).toISOString();

function stats(partial: Partial<RepoStats>): RepoStats {
  return {
    stars: 0, pushedAt: null, license: null, description: null, homepage: null,
    archived: false, topics: [], latestRelease: null, ...partial,
  };
}
const entry = (s: Partial<RepoStats>): RepoEntry => ({ stats: stats(s), fetchedAt: '2026-10-12T00:00:00Z', source: 'cache' });

const alts: Alternative[] = [
  { repo: 'a/desktop', summary: '', platforms: ['windows', 'mac', 'linux'], level: 'einfach' },
  { repo: 'b/server', summary: '', platforms: ['server'], level: 'mittel' },
  { repo: 'c/old', summary: '', platforms: ['windows'], level: 'profi' },
  { repo: 'd/unknown', summary: '', platforms: ['web'], level: 'einfach' },
];
const entries: Record<string, RepoEntry> = {
  'a/desktop': entry({ stars: 500, pushedAt: monthsAgo(1) }),
  'b/server': entry({ stars: 9000, pushedAt: monthsAgo(10) }),
  'c/old': entry({ stars: 100, pushedAt: monthsAgo(30) }),
};
const base: FilterOptions = { platforms: [], levels: [], onlyActive: false, sort: 'stars' };
const repos = (o: Partial<FilterOptions>) => filterAndSort(alts, entries, { ...base, ...o }, NOW).visible.map((a) => a.repo);

describe('filterAndSort', () => {
  it('shows everything without filters, sorted by stars (unknown last)', () => {
    expect(repos({})).toEqual(['b/server', 'a/desktop', 'c/old', 'd/unknown']);
  });

  it('filters by platform (any match)', () => {
    expect(repos({ platforms: ['windows'] })).toEqual(['a/desktop', 'c/old']);
    expect(repos({ platforms: ['server', 'web'] })).toEqual(['b/server', 'd/unknown']);
  });

  it('filters by level', () => {
    expect(repos({ levels: ['einfach'] })).toEqual(['a/desktop', 'd/unknown']);
  });

  it('"nur aktiv gepflegt" hides red but keeps unknown', () => {
    expect(repos({ onlyActive: true })).toEqual(['b/server', 'a/desktop', 'd/unknown']);
  });

  it('sorts by last update', () => {
    expect(repos({ sort: 'updated' })).toEqual(['a/desktop', 'b/server', 'c/old', 'd/unknown']);
  });

  it('counts hidden alternatives', () => {
    expect(filterAndSort(alts, entries, { ...base, platforms: ['windows'] }, NOW).hidden).toBe(2);
  });
});

describe('maintenance traffic light', () => {
  it('green < 6 months, yellow < 18, red older', () => {
    expect(maintenance(stats({ pushedAt: monthsAgo(5) }), NOW)).toBe('green');
    expect(maintenance(stats({ pushedAt: monthsAgo(6) }), NOW)).toBe('yellow');
    expect(maintenance(stats({ pushedAt: monthsAgo(17) }), NOW)).toBe('yellow');
    expect(maintenance(stats({ pushedAt: monthsAgo(18) }), NOW)).toBe('red');
  });
  it('archived is always red, missing data is unknown', () => {
    expect(maintenance(stats({ pushedAt: monthsAgo(0), archived: true }), NOW)).toBe('red');
    expect(maintenance(stats({}), NOW)).toBe('unknown');
    expect(maintenance(undefined, NOW)).toBe('unknown');
  });
});

describe('formatting', () => {
  it('formats stars', () => {
    expect(formatStars(999)).toBe('999');
    expect(formatStars(1000)).toBe('1k');
    expect(formatStars(12345)).toBe('12.3k');
    expect(formatStars(123456)).toBe('123k');
    expect(formatStars(1_250_000)).toBe('1.2M');
  });
  it('formats relative time in German', () => {
    expect(relativeTime(new Date(NOW).toISOString(), NOW)).toBe('heute');
    expect(relativeTime(new Date(NOW - 86400000).toISOString(), NOW)).toBe('gestern');
    expect(relativeTime(new Date(NOW - 5 * 86400000).toISOString(), NOW)).toBe('vor 5 Tagen');
    expect(relativeTime(monthsAgo(1), NOW)).toBe('vor 1 Monat');
    expect(relativeTime(monthsAgo(3), NOW)).toBe('vor 3 Monaten');
    expect(relativeTime(monthsAgo(25), NOW)).toBe('vor 2 Jahren');
    expect(relativeTime(null, NOW)).toBe('unbekannt');
  });
  it('makes nice repo names', () => {
    expect(prettyRepoName('flameshot-org/flameshot')).toBe('Flameshot');
    expect(prettyRepoName('LibreOffice/core')).toBe('LibreOffice');
    expect(prettyRepoName('KDE/krita')).toBe('Krita');
    expect(prettyRepoName('foo/server')).toBe('Foo');
    expect(prettyRepoName('x/my-cool-app')).toBe('My Cool');
  });
  it('detects the platform', () => {
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)')).toBe('mac');
    expect(detectPlatform('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux');
  });
});
