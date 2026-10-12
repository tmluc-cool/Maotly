import { afterEach, describe, expect, it } from 'vitest';
import { de } from '../src/shared/i18n/de';
import { en } from '../src/shared/i18n/en';
import { es } from '../src/shared/i18n/es';
import { detectLang, setLang, t, tn, tx } from '../src/shared/i18n';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('translations', () => {
  afterEach(() => setLang('en'));

  it('have the same keys and placeholders in every language', () => {
    for (const [name, catalog] of Object.entries({ de, es })) {
      expect(Object.keys(catalog).sort(), name).toEqual(Object.keys(en).sort());
      for (const [key, text] of Object.entries(en)) {
        expect(placeholders(catalog[key as keyof typeof en]), `${name}: ${key}`).toEqual(placeholders(text));
      }
    }
  });

  it('use Swiss spelling in German', () => {
    expect(Object.values(de).filter((s) => s.includes('ß'))).toEqual([]);
  });

  it('fills placeholders and picks plural forms', () => {
    expect(t('status.newVersion', { version: '0.1.9' })).toBe('Download new version 0.1.9');
    expect(tn('common.projects', 1)).toBe('1 project');
    expect(tn('common.projects', 104213)).toBe('104,213 projects');
    setLang('de');
    expect(tn('common.projects', 104213)).toBe("104'213 Projekte");
    setLang('es');
    expect(tn('project.reviews', 1)).toBe('1 reseña');
  });

  it('picks texts of the curated list', () => {
    const text = { en: 'Free', de: 'Gratis', es: 'Gratis' };
    expect(tx(text)).toBe('Free');
    setLang('de');
    expect(tx(text)).toBe('Gratis');
    expect(tx('Adobe Photoshop')).toBe('Adobe Photoshop');
  });

  it('follows the system language, English otherwise', () => {
    expect(detectLang(['de-CH', 'en-US'])).toBe('de');
    expect(detectLang(['fr-FR', 'es-MX'])).toBe('es');
    expect(detectLang(['fr-FR', 'it-IT'])).toBe('en');
    expect(detectLang([])).toBe('en');
  });
});
