import { afterEach, describe, expect, it } from 'vitest';
import { setLang } from '../src/shared/i18n';
import { formatCount, formatDate, formatStars, isNew, maintenance, prettyRepoName, relativeTime } from '../src/renderer/src/lib/format';
import { DEFAULT_FILTERS, filtersToParams, parseFilters, parseHash } from '../src/renderer/src/lib/router';

const NOW = Date.parse('2026-10-12T12:00:00Z');
const monthsAgo = (m: number) => new Date(Date.UTC(2026, 9 - m, 12)).toISOString();

describe('maintenance traffic light', () => {
  it('green < 6 months, yellow < 18, red older or archived', () => {
    expect(maintenance({ pushed_at: monthsAgo(5), archived: 0 }, NOW)).toBe('green');
    expect(maintenance({ pushed_at: monthsAgo(6), archived: 0 }, NOW)).toBe('yellow');
    expect(maintenance({ pushed_at: monthsAgo(17), archived: 0 }, NOW)).toBe('yellow');
    expect(maintenance({ pushed_at: monthsAgo(18), archived: 0 }, NOW)).toBe('red');
    expect(maintenance({ pushed_at: monthsAgo(0), archived: 1 }, NOW)).toBe('red');
    expect(maintenance({ pushed_at: null, archived: 0 }, NOW)).toBe('unknown');
  });
});

describe('formatting', () => {
  afterEach(() => setLang('en'));

  it('formats numbers', () => {
    expect(formatStars(999)).toBe('999');
    expect(formatStars(12345)).toBe('12.3k');
    expect(formatStars(1_250_000)).toBe('1.2M');
    expect(formatCount(104213)).toBe('104,213');
    setLang('de');
    expect(formatCount(104213)).toBe("104'213");
    expect(formatCount(999)).toBe('999');
    setLang('es');
    expect(formatCount(104213)).toBe('104.213');
  });
  it('formats relative time in English', () => {
    expect(relativeTime(new Date(NOW).toISOString(), NOW)).toBe('today');
    expect(relativeTime(new Date(NOW - 86400000).toISOString(), NOW)).toBe('yesterday');
    expect(relativeTime(new Date(NOW - 5 * 86400000).toISOString(), NOW)).toBe('5 days ago');
    expect(relativeTime(monthsAgo(1), NOW)).toBe('1 month ago');
    expect(relativeTime(monthsAgo(25), NOW)).toBe('2 years ago');
  });
  it('formats relative time in Spanish', () => {
    setLang('es');
    expect(relativeTime(new Date(NOW).toISOString(), NOW)).toBe('hoy');
    expect(relativeTime(monthsAgo(3), NOW)).toBe('hace 3 meses');
  });
  it('formats dates per language, a plain day stays that day', () => {
    expect(formatDate('2026-10-12')).toBe('Oct 12, 2026');
    setLang('de');
    expect(formatDate('2026-10-12')).toBe('12.10.2026');
  });
  it('formats relative time in German', () => {
    setLang('de');
    expect(relativeTime(new Date(NOW).toISOString(), NOW)).toBe('heute');
    expect(relativeTime(new Date(NOW - 5 * 86400000).toISOString(), NOW)).toBe('vor 5 Tagen');
    expect(relativeTime(monthsAgo(1), NOW)).toBe('vor 1 Monat');
    expect(relativeTime(monthsAgo(3), NOW)).toBe('vor 3 Monaten');
    expect(relativeTime(monthsAgo(25), NOW)).toBe('vor 2 Jahren');
  });
  it('marks new projects, but not base ones', () => {
    expect(isNew({ first_seen_at: new Date(NOW - 86400000).toISOString(), source: 'delta' }, NOW)).toBe(true);
    expect(isNew({ first_seen_at: new Date(NOW - 86400000).toISOString(), source: 'base' }, NOW)).toBe(false);
    expect(isNew({ first_seen_at: new Date(NOW - 8 * 86400000).toISOString(), source: 'live' }, NOW)).toBe(false);
  });
  it('makes nice repo names', () => {
    expect(prettyRepoName('flameshot-org/flameshot')).toBe('Flameshot');
    expect(prettyRepoName('LibreOffice/core')).toBe('LibreOffice');
  });
});

describe('router', () => {
  it('keeps filters and sorting in the URL', () => {
    const f = { ...DEFAULT_FILTERS, category: 'buero-pdf', platform: 'server' as const, minStars: 1000, updatedWithin: '1y' as const, licensed: true, activeOnly: true, sort: 'stars' as const };
    const params = filtersToParams(f, new URLSearchParams({ q: 'pdf editor' }));
    const route = parseHash(`#/suche?${params}`);
    expect(route).toEqual({ name: 'search', q: 'pdf editor', filters: f });
  });
  it('ignores invalid values', () => {
    expect(parseFilters(new URLSearchParams('plattform=dos&sterne=-5&sort=x&aktualisiert=3y'))).toEqual(DEFAULT_FILTERS);
  });
  it('parses the other routes', () => {
    expect(parseHash('#/statt/adobe-photoshop')).toEqual({ name: 'product', id: 'adobe-photoshop' });
    expect(parseHash('#/kategorie/cad-3d-gis?sort=new').name).toBe('category');
    expect(parseHash('#/datenschutz')).toEqual({ name: 'privacy' });
    expect(parseHash('#/gibtsnicht')).toEqual({ name: 'notfound' });
  });
});
