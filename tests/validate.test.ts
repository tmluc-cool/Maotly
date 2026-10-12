import { describe, expect, it } from 'vitest';
import data from '../data/alternatives.json';
import { validateCurated } from '../src/shared/validate';
import type { AlternativesData } from '../src/shared/types';

describe('curated list', () => {
  it('is valid', () => {
    const { errors, repos } = validateCurated(data as AlternativesData);
    expect(errors).toEqual([]);
    expect(repos.length).toBeGreaterThan(100);
  });

  it('catches typical mistakes', () => {
    const bad = {
      categories: [{ id: 'c', name: 'C' }],
      products: [
        { id: 'p', name: 'P', aliases: [], category: 'nope', alternatives: [{ repo: 'a/b', summary: 'x'.repeat(121), platforms: ['dos'], level: 'leicht' }] },
        { id: 'p', name: 'Grosse Straße', aliases: [], category: 'c', alternatives: [{ repo: 'a', summary: 'ok', platforms: ['web'], level: 'einfach' }] },
      ],
    } as unknown as AlternativesData;
    const text = validateCurated(bad).errors.join('\n');
    for (const re of [/Doppelte Produkt-ID/, /unbekannte Kategorie/, /max\. 120/, /ungültige Plattform/, /ungültiges Level/, /ß/, /owner\/name/]) {
      expect(text).toMatch(re);
    }
  });
});
