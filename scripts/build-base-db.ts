#!/usr/bin/env tsx
// Builds resources/base.db with the base filter (about 100'000 projects, ~1 hour with token).
// Can be stopped with Ctrl+C and continues exactly where it stopped on the next run.
//
//   npm run build-base-db                 # normal run / resume
//   npm run build-base-db -- --restart    # throw away the progress and start over
//   npm run build-base-db -- --filter "stars:>=20000"   # small test database
//   npm run build-base-db -- --out some/other.db

import Database from 'better-sqlite3';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  baseFilter,
  configure,
  crawl,
  getMeta,
  GitHubClient,
  initialCrawlState,
  isoDay,
  migrate,
  repoCount,
  setMeta,
  toRepoRow,
  upsertRepos,
  type CrawlState,
  type SearchFilter,
} from '../src/shared/crawler';
import { envVar, formatDuration, formatNumber } from './lib/env';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const out = resolve(arg('--out') ?? 'resources/base.db');
const today = isoDay(Date.now());
const PROGRESS_KEY = 'base_build_progress';

let filter: SearchFilter = baseFilter(today);
const custom = arg('--filter');
if (custom) {
  // e.g. "stars:>=20000" – handy for a quick test database
  const m = custom.match(/stars:>=(\d+)/);
  filter = { ...filter, minStars: m ? Number(m[1]) : filter.minStars };
}

const token = envVar('GITHUB_TOKEN');
if (!token) {
  console.warn('⚠  Kein GITHUB_TOKEN (.env). Ohne Token sind nur 10 Suchen pro Minute erlaubt – das dauert sehr lange.\n');
}

mkdirSync(dirname(out), { recursive: true });
const db = new Database(out);
configure(db);
migrate(db);

let state: CrawlState;
const saved = getMeta(db, PROGRESS_KEY);
if (saved && !args.includes('--restart')) {
  state = JSON.parse(saved);
  console.log(`↻ Setze fort: ${state.slicesDone} Teilbereiche fertig, ${state.queue.length} offen, ${formatNumber(repoCount(db))} Projekte in der Datenbank.`);
} else {
  state = initialCrawlState(filter);
  console.log(`Starte neu mit Filter: stars:>=${filter.minStars} ${filter.qualifiers.join(' ')}`);
}

const controller = new AbortController();
let stopping = false;
process.on('SIGINT', () => {
  if (stopping) process.exit(130);
  stopping = true;
  console.log('\n⏸  Stoppe nach dem aktuellen Schritt … (nochmals Ctrl+C zum sofortigen Abbruch)');
  controller.abort();
});

const client = new GitHubClient({
  token,
  signal: controller.signal,
  userAgent: 'GratisStatt-base-builder',
  onWait: (ms, reason) => {
    if (ms > 10_000) console.log(`   … warte ${formatDuration(ms)} (${reason})`);
  },
});

async function main() {
const started = Date.now();
let lastLog = 0;
const report = () => {
  const now = Date.now();
  if (now - lastLog < 5000) return;
  lastLog = now;
  console.log(
    `   ${formatNumber(repoCount(db))} Projekte · ${state.slicesDone} Teilbereiche fertig · ${state.queue.length} offen · ${client.requests} Anfragen · ${formatDuration(now - started)}`,
  );
};

try {
  const result = await crawl({
    client,
    filter,
    state,
    today,
    shouldStop: () => stopping,
    onRepos: (repos) => {
      upsertRepos(db, repos.map(toRepoRow), 'base');
      report();
    },
    onState: (s) => setMeta(db, PROGRESS_KEY, JSON.stringify(s)),
  });

  if (result === 'stopped') {
    console.log(`\n⏸  Gestoppt. Nochmals "npm run build-base-db" setzt genau hier fort.`);
  } else {
    setMeta(db, PROGRESS_KEY, null);
    setMeta(db, 'base_version', today);
    console.log('\nOptimiere Volltextindex und Datei (VACUUM) …');
    db.prepare("INSERT INTO repos_fts(repos_fts) VALUES ('optimize')").run();
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.exec('VACUUM');
    db.close();
    const size = statSync(out).size;
    console.log(
      `\n✔ Fertig: ${formatNumber(repoCountFromFile(out))} Projekte, ${(size / 1024 / 1024).toFixed(1)} MB, base_version ${today}` +
        (state.truncated ? `\n⚠ ${state.truncated} Teilbereiche hatten mehr als 1000 Treffer und liessen sich nicht weiter teilen.` : ''),
    );
  }
} catch (err) {
  if (stopping) {
    console.log(`\n⏸  Gestoppt. Nochmals "npm run build-base-db" setzt genau hier fort.`);
  } else {
    console.error(`\n✖ Fehler: ${(err as Error).message}\n   Der Fortschritt ist gespeichert. Nochmals starten setzt fort.`);
    process.exitCode = 1;
  }
} finally {
  if (db.open) db.close();
}
}

void main();

function repoCountFromFile(file: string): number {
  if (!existsSync(file)) return 0;
  const d = new Database(file, { readonly: true });
  try {
    return repoCount(d);
  } finally {
    d.close();
  }
}
