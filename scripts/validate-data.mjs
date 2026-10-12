#!/usr/bin/env node
// Checks data/alternatives.json against the rules in CLAUDE.md.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLATFORMS = new Set(['windows', 'mac', 'linux', 'android', 'ios', 'web', 'server']);
const LEVELS = new Set(['einfach', 'mittel', 'profi']);
const MAX_SUMMARY = 120;

export function validate(data, snapshot) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);

  const categories = new Set();
  for (const c of data.categories ?? []) {
    if (!c.id || !c.name) err(`Kategorie ohne id/name: ${JSON.stringify(c)}`);
    if (categories.has(c.id)) err(`Doppelte Kategorie-ID: ${c.id}`);
    categories.add(c.id);
  }

  const ids = new Set();
  for (const p of data.products ?? []) {
    const where = `Produkt "${p.id ?? p.name}"`;
    if (!p.id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id)) err(`${where}: ungültige ID (nur a-z, 0-9 und -)`);
    if (ids.has(p.id)) err(`Doppelte Produkt-ID: ${p.id}`);
    ids.add(p.id);
    if (!p.name) err(`${where}: Name fehlt`);
    if (!Array.isArray(p.aliases)) err(`${where}: aliases muss eine Liste sein`);
    if (!categories.has(p.category)) err(`${where}: unbekannte Kategorie "${p.category}"`);
    if (/ß/.test(JSON.stringify(p))) err(`${where}: enthält "ß" – bitte "ss" schreiben`);
    if (!Array.isArray(p.alternatives) || p.alternatives.length === 0) err(`${where}: keine Alternativen`);

    const repos = new Set();
    for (const a of p.alternatives ?? []) {
      const aw = `${where} → ${a.repo}`;
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(a.repo ?? '')) err(`${aw}: Repo muss "owner/name" sein`);
      if (repos.has(a.repo)) err(`${aw}: doppelt im selben Produkt`);
      repos.add(a.repo);
      if (!a.summary) err(`${aw}: summary fehlt`);
      else if (a.summary.length > MAX_SUMMARY) err(`${aw}: summary ist ${a.summary.length} Zeichen lang (max. ${MAX_SUMMARY})`);
      if (!Array.isArray(a.platforms) || a.platforms.length === 0) err(`${aw}: keine Plattformen`);
      for (const pl of a.platforms ?? []) if (!PLATFORMS.has(pl)) err(`${aw}: ungültige Plattform "${pl}"`);
      if (!LEVELS.has(a.level)) err(`${aw}: ungültiges Level "${a.level}"`);
      if (a.website !== undefined && !/^https:\/\//.test(a.website)) err(`${aw}: website muss mit https:// beginnen`);
      if (snapshot && !snapshot.repos?.[a.repo]) err(`${aw}: keine Stats im Snapshot (npm run fetch-stats)`);
    }
  }

  if (snapshot?.source === 'seed') {
    warnings.push('Snapshot ist nur ein Seed (ohne Releases/Lizenzen). Für den Release: npm run fetch-stats');
  }
  return { errors, warnings };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const data = JSON.parse(readFileSync(join(root, 'data', 'alternatives.json'), 'utf8'));
  const snapshot = JSON.parse(readFileSync(join(root, 'data', 'repo-stats.snapshot.json'), 'utf8'));
  const { errors, warnings } = validate(data, snapshot);
  for (const w of warnings) console.warn(`⚠ ${w}`);
  if (errors.length) {
    console.error(`✖ ${errors.length} Fehler in den Daten:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  const alts = data.products.reduce((n, p) => n + p.alternatives.length, 0);
  console.log(`✔ Daten gültig: ${data.products.length} Produkte, ${alts} Alternativen, ${data.categories.length} Kategorien.`);
}
