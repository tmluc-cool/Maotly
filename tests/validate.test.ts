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
      categories: [{ id: 'c', name: { en: 'C', de: 'C', es: 'C' } }],
      products: [
        { id: 'p', name: 'P', aliases: [], category: 'nope', alternatives: [{ repo: 'a/b', summary: { en: 'x'.repeat(121), de: 'ok', es: 'ok' }, platforms: ['dos'], level: 'leicht' }] },
        { id: 'p', name: 'Grosse Straße', aliases: [], category: 'c', note: { en: 'n', de: 'n' }, alternatives: [{ repo: 'a', summary: 'nur Deutsch', platforms: ['web'], level: 'einfach' }] },
      ],
    } as unknown as AlternativesData;
    const text = validateCurated(bad).errors.join('\n');
    for (const re of [/Doppelte Produkt-ID/, /unbekannte Kategorie/, /max\. 120/, /ungültige Plattform/, /ungültiges Level/, /ß/, /owner\/name/, /note: Sprache "es" fehlt/, /summary: muss \{ en, de, es \}/]) {
      expect(text).toMatch(re);
    }
  });
});
