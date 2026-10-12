import { describe, expect, it } from 'vitest';
import raw from '../data/alternatives.json';
import type { AlternativesData } from '../src/shared/types';
import { createProductSearch } from '../src/renderer/src/lib/search';

const data = raw as AlternativesData;
const search = createProductSearch(data.products);
const firstId = (q: string) => search.search(q)[0]?.id;

describe('product search', () => {
  it('finds products by name', () => {
    expect(firstId('Photoshop')).toBe('adobe-photoshop');
    expect(firstId('Notion')).toBe('notion');
  });

  it('finds products by alias', () => {
    expect(firstId('bildbearbeitung')).toBe('adobe-photoshop');
    expect(firstId('excel')).toBe('microsoft-365');
    expect(firstId('lastpass')).toBe('1password');
  });

  it('tolerates typos', () => {
    expect(firstId('photshop')).toBe('adobe-photoshop');
    expect(firstId('dropbx')).toBe('dropbox');
    expect(firstId('teamviever')).toBe('teamviewer');
  });

  it('is case-insensitive and ignores umlauts', () => {
    expect(firstId('PHOTOSHOP')).toBe('adobe-photoshop');
    expect(firstId('ubersetzer')).toBe('deepl-pro');
  });

  it('puts exact alias hits first', () => {
    expect(firstId('ps')).toBe('adobe-photoshop');
  });

  it('returns nothing for very short or empty input', () => {
    expect(search.search('')).toEqual([]);
    expect(search.search('a')).toEqual([]);
  });

  it('returns nothing for nonsense', () => {
    expect(search.search('qqxxzzvv')).toEqual([]);
  });

  it('respects the limit and has no duplicates', () => {
    const res = search.search('adobe', 3);
    expect(res.length).toBeLessThanOrEqual(3);
    expect(new Set(res.map((p) => p.id)).size).toBe(res.length);
  });
});
