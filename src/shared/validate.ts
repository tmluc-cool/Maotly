import { LANGS } from './i18n';
import { LEVELS, PLATFORMS, type AlternativesData } from './types';

export type CuratedData = AlternativesData;

const MAX_SUMMARY = 120;

/** Problems of a text that must exist in every language (empty list = fine). */
function textProblems(text: unknown, max?: number): string[] {
  if (!text || typeof text !== 'object') return [`muss { ${LANGS.join(', ')} } sein`];
  const t = text as Record<string, unknown>;
  const out: string[] = [];
  for (const lang of LANGS) {
    const v = t[lang];
    if (typeof v !== 'string' || !v.trim()) out.push(`Sprache "${lang}" fehlt`);
    else if (max && v.length > max) out.push(`"${lang}" ist ${v.length} Zeichen lang (max. ${max})`);
  }
  for (const key of Object.keys(t)) if (!(LANGS as string[]).includes(key)) out.push(`unbekannte Sprache "${key}"`);
  return out;
}

/** Checks the curated list. Returns errors and the list of all referenced repos. */
export function validateCurated(data: CuratedData): { errors: string[]; repos: string[] } {
  const errors: string[] = [];
  const err = (m: string) => errors.push(m);
  const platforms = new Set<string>(PLATFORMS);
  const levels = new Set<string>(LEVELS);

  const categories = new Set<string>();
  for (const c of data.categories ?? []) {
    if (!c.id) err(`Kategorie ohne id: ${JSON.stringify(c)}`);
    for (const m of textProblems(c.name)) err(`Kategorie "${c.id}" → name: ${m}`);
    if (categories.has(c.id)) err(`Doppelte Kategorie-ID: ${c.id}`);
    categories.add(c.id);
  }

  const ids = new Set<string>();
  const repos = new Set<string>();
  for (const p of data.products ?? []) {
    const where = `Produkt "${p.id ?? p.name}"`;
    if (!p.id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id)) err(`${where}: ungültige ID (nur a-z, 0-9 und -)`);
    if (ids.has(p.id)) err(`Doppelte Produkt-ID: ${p.id}`);
    ids.add(p.id);
    if (!p.name || typeof p.name !== 'string') err(`${where}: Name fehlt`);
    if (p.note !== undefined) for (const m of textProblems(p.note)) err(`${where} → note: ${m}`);
    if (!Array.isArray(p.aliases)) err(`${where}: aliases muss eine Liste sein`);
    if (!categories.has(p.category)) err(`${where}: unbekannte Kategorie "${p.category}"`);
    if (/ß/.test(JSON.stringify(p))) err(`${where}: enthält "ß" – bitte "ss" schreiben`);
    if (!Array.isArray(p.alternatives) || p.alternatives.length === 0) err(`${where}: keine Alternativen`);

    const seen = new Set<string>();
    for (const a of p.alternatives ?? []) {
      const aw = `${where} → ${a.repo}`;
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(a.repo ?? '')) err(`${aw}: Repo muss "owner/name" sein`);
      if (seen.has(a.repo)) err(`${aw}: doppelt im selben Produkt`);
      seen.add(a.repo);
      repos.add(a.repo);
      for (const m of textProblems(a.summary, MAX_SUMMARY)) err(`${aw} → summary: ${m}`);
      if (a.note !== undefined) for (const m of textProblems(a.note)) err(`${aw} → note: ${m}`);
      if (!Array.isArray(a.platforms) || a.platforms.length === 0) err(`${aw}: keine Plattformen`);
      for (const pl of a.platforms ?? []) if (!platforms.has(pl)) err(`${aw}: ungültige Plattform "${pl}"`);
      if (!levels.has(a.level)) err(`${aw}: ungültiges Level "${a.level}"`);
      if (a.website !== undefined && !/^https:\/\//.test(a.website)) err(`${aw}: website muss mit https:// beginnen`);
    }
  }
  return { errors, repos: [...repos] };
}
