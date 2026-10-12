#!/usr/bin/env tsx
// Downloads the newest published base database into resources/base.db
// (faster than "npm run build-base-db"). The file is checked against its SHA-256.

import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { downloadVerified, parseManifest } from '../src/main/sync/packages';

const DATA_REPO = process.env.DATA_REPO ?? 'tmluc-cool/gratisstatt-data';

async function main() {
  const res = await fetch(`https://github.com/${DATA_REPO}/releases/latest/download/manifest.json`, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Kein Manifest gefunden (${res.status}). Gibt es schon ein Release in ${DATA_REPO}?`);
  const base = parseManifest(await res.json()).latest_base;
  if (!base) throw new Error('Im Manifest ist noch keine Basis-Datenbank eingetragen.');
  mkdirSync('resources', { recursive: true });
  const tmp = resolve('resources/base.db.download');
  console.log(`Lade Basis ${base.date} (${(base.size / 1024 / 1024).toFixed(1)} MB) …`);
  await downloadVerified(fetch, base, tmp);
  if (existsSync('resources/base.db')) renameSync('resources/base.db', 'resources/base.db.old');
  renameSync(tmp, 'resources/base.db');
  console.log(`✔ resources/base.db (${base.count.toLocaleString('de-CH')} Projekte), Prüfsumme stimmt`);
}

main().catch((err) => {
  console.error(`✖ ${(err as Error).message}`);
  process.exit(1);
});
