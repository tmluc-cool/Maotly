#!/usr/bin/env tsx
// Builds the weekly update package (runs in the GitHub Action of the gratisstatt-data repo).
//
//   tsx scripts/build-delta.ts --repo owner/gratisstatt-data --out ../out [--prev ../prev/manifest.json] [--base ../out/base-2026-10-12.db]
//
// Env: GITHUB_TOKEN (search 30/min), SERVER_URL + ADMIN_SECRET (optional: network submissions)

import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  addDays,
  crawl,
  getMeta,
  GitHubClient,
  initialCrawlState,
  isoDay,
  newProjectsFilter,
  PACKAGE_SCHEMA_SQL,
  repoCount,
  setMeta,
  toRepoRow,
  updatesFilter,
  upsertRepos,
} from '../src/shared/crawler';
import { parseManifest, type Manifest } from '../src/main/sync/packages';
import { checkSubmission, fileEntry, nextManifest, sinceFrom, type Verdict } from './lib/delta';
import { envVar, formatNumber } from './lib/env';

const args = process.argv.slice(2);
const arg = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  const repo = arg('--repo') ?? envVar('DATA_REPO');
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('--repo owner/name fehlt');
  const outDir = resolve(arg('--out') ?? 'out');
  mkdirSync(outDir, { recursive: true });
  const today = isoDay(Date.now());
  const now = new Date().toISOString();

  const prevPath = arg('--prev');
  const prev: Manifest | null = prevPath && existsSync(prevPath) ? parseManifest(JSON.parse(readFileSync(prevPath, 'utf8'))) : null;
  const since = sinceFrom(prev, addDays(today, -7));
  console.log(`Update-Paket ${today}, Änderungen seit ${since}`);

  const file = join(outDir, `delta-${today}.db`);
  rmSync(file, { force: true });
  const db = new Database(file);
  db.exec(PACKAGE_SCHEMA_SQL);

  const client = new GitHubClient({
    token: envVar('GITHUB_TOKEN'),
    userAgent: 'GratisStatt-weekly',
    onWait: (ms, why) => ms > 10_000 && console.log(`   … warte ${Math.round(ms / 1000)} s (${why})`),
  });

  // 1. Changed and new projects since the last package.
  for (const [label, filter] of [
    ['Aktualisierte Projekte', updatesFilter(since)],
    ['Neue Projekte', newProjectsFilter(since)],
  ] as const) {
    const state = initialCrawlState(filter);
    await crawl({ client, filter, state, today, onRepos: (r) => void upsertRepos(db, r.map(toRepoRow), 'delta', now) });
    console.log(`✔ ${label}: ${formatNumber(state.reposSeen)} (Teilbereiche: ${state.slicesDone}${state.truncated ? `, ${state.truncated} gekappt` : ''})`);
  }

  // 2. Network submissions: check every repo ourselves, then report back.
  const serverUrl = envVar('SERVER_URL');
  const adminSecret = envVar('ADMIN_SECRET');
  if (serverUrl && adminSecret) {
    const headers = { Authorization: `Bearer ${adminSecret}`, 'Content-Type': 'application/json' };
    const res = await fetch(`${serverUrl}/v1/admin/submissions?status=pending`, { headers });
    if (!res.ok) throw new Error(`Server: ${res.status}`);
    const { repoIds } = (await res.json()) as { repoIds: number[] };
    const results: ({ repoId: number } & Verdict)[] = [];
    for (const id of repoIds) {
      const gh = await client.getRepoById(id);
      const verdict = checkSubmission(gh);
      if (verdict.status === 'accepted' && gh) upsertRepos(db, [toRepoRow(gh)], 'delta', now);
      results.push({ repoId: id, ...verdict });
    }
    for (let i = 0; i < results.length; i += 500) {
      const r = await fetch(`${serverUrl}/v1/admin/submissions/result`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ results: results.slice(i, i + 500) }),
      });
      if (!r.ok) throw new Error(`Server (Ergebnis): ${r.status}`);
    }
    const accepted = results.filter((r) => r.status === 'accepted').length;
    console.log(`✔ Netzwerk-Beiträge: ${accepted} angenommen, ${results.length - accepted} abgelehnt`);
  } else {
    console.log('– Netzwerk-Beiträge übersprungen (SERVER_URL/ADMIN_SECRET fehlen)');
  }

  setMeta(db, 'package_date', today);
  setMeta(db, 'since', since);
  const count = repoCount(db);
  db.exec('VACUUM');
  db.close();

  // 3. Manifest with SHA-256 of every file.
  const releaseUrl = (tag: string, name: string) => `https://github.com/${repo}/releases/download/${tag}/${name}`;
  const delta = fileEntry(file, today, releaseUrl(`delta-${today}`, `delta-${today}.db`), count);
  let base = null;
  const basePath = arg('--base');
  if (basePath && existsSync(basePath)) {
    const b = new Database(basePath, { readonly: true });
    const baseDate = getMeta(b, 'base_version') ?? today;
    const baseCount = repoCount(b);
    b.close();
    base = fileEntry(basePath, baseDate, releaseUrl(`delta-${today}`, `base-${baseDate}.db`), baseCount);
  }
  const manifest = nextManifest(prev, delta, base, now);
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`✔ delta-${today}.db: ${formatNumber(count)} Projekte, ${(delta.size / 1024 / 1024).toFixed(1)} MB`);
  console.log(`✔ manifest.json: ${manifest.deltas.length} Pakete${manifest.latest_base ? `, Basis ${manifest.latest_base.date}` : ''}`);
}

main().catch((err) => {
  console.error(`✖ ${(err as Error).message}`);
  process.exit(1);
});
