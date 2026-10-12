import { describe, expect, it } from 'vitest';
import data from '../data/alternatives.json';
import snapshot from '../data/repo-stats.snapshot.json';
// @ts-expect-error plain JS module without types
import { validate } from '../scripts/validate-data.mjs';

describe('bundled data', () => {
  it('passes validation', () => {
    const { errors } = validate(data, snapshot);
    expect(errors).toEqual([]);
  });

  it('catches typical mistakes', () => {
    const bad = {
      categories: [{ id: 'c', name: 'C' }],
      products: [
        { id: 'p', name: 'P', aliases: [], category: 'nope', alternatives: [{ repo: 'a/b', summary: 'x'.repeat(121), platforms: ['dos'], level: 'leicht' }] },
        { id: 'p', name: 'Grosse Straße', aliases: [], category: 'c', alternatives: [{ repo: 'a/b', summary: 'ok', platforms: ['web'], level: 'einfach' }] },
      ],
    };
    const { errors } = validate(bad, { repos: {} });
    const text = errors.join('\n');
    expect(text).toMatch(/Doppelte Produkt-ID/);
    expect(text).toMatch(/unbekannte Kategorie/);
    expect(text).toMatch(/max\. 120/);
    expect(text).toMatch(/ungültige Plattform/);
    expect(text).toMatch(/ungültiges Level/);
    expect(text).toMatch(/keine Stats/);
    expect(text).toMatch(/ß/);
  });
});
