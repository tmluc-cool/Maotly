#!/usr/bin/env tsx
// Checks data/alternatives.json and that every curated repo exists in resources/base.db.
//   npm run validate            # check only
//   npm run validate -- --fix   # fetch missing repos from GitHub and store them in base.db

import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { configure, GitHubClient, migrate, toRepoRow, upsertRepos } from '../src/shared/crawler';
import { validateCurated, type CuratedData } from '../src/shared/validate';
import { envVar } from './lib/env';

const fix = process.argv.includes('--fix');
const dbPath = resolve('resources/base.db');
const data = JSON.parse(readFileSync(resolve('data/alternatives.json'), 'utf8')) as CuratedData;

const { errors, repos } = validateCurated(data);
let failed = errors.length > 0;
for (const e of errors) console.error(`  ✖ ${e}`);

if (!existsSync(dbPath)) {
  console.error('✖ resources/base.db fehlt. Zuerst "npm run build-base-db" ausführen.');
  process.exit(1);
}

const db = new Database(dbPath);
configure(db);
migrate(db);
const find = db.prepare('SELECT full_name FROM repos WHERE full_name = ? COLLATE NOCASE').pluck();
const missing = repos.filter((r) => !find.get(r));

async function main() {
if (missing.length && fix) {
  const client = new GitHubClient({
    token: envVar('GITHUB_TOKEN'),
    userAgent: 'GratisStatt-validate',
    onWait: (ms, why) => {
      if (ms > 10_000) console.log(`   … GitHub-Limit erreicht, warte ${Math.ceil(ms / 60_000)} min (${why}). Mit GITHUB_TOKEN in .env geht es schneller.`);
    },
  });
  console.log(`Hole ${missing.length} fehlende Repos von GitHub …`);
  for (const name of [...missing]) {
    const repo = await client.getRepo(name);
    if (!repo) {
      console.error(`  ✖ ${name}: gibt es auf GitHub nicht (404). Bitte in alternatives.json korrigieren.`);
      continue;
    }
    upsertRepos(db, [toRepoRow(repo)], 'base');
    missing.splice(missing.indexOf(name), 1);
    if (repo.full_name.toLowerCase() !== name.toLowerCase()) {
      console.warn(`  ↪ ${name} heisst jetzt ${repo.full_name}. Bitte in alternatives.json anpassen.`);
      failed = true;
    } else {
      console.log(`  ✔ ${name} ergänzt`);
    }
  }
}
db.close();

if (missing.length) {
  failed = true;
  console.error(`✖ ${missing.length} Repos fehlen in base.db:`);
  for (const m of missing) console.error(`  - ${m}`);
  if (!fix) console.error('  Tipp: "npm run validate -- --fix" holt sie von GitHub.');
}

if (failed) process.exit(1);
const alts = data.products.reduce((n, p) => n + p.alternatives.length, 0);
console.log(`✔ Daten gültig: ${data.products.length} Produkte, ${alts} Alternativen, alle ${repos.length} Repos in base.db.`);
}

void main();
