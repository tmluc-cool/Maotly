#!/usr/bin/env node
// Fetches stars, last push, license and latest release for every repo in
// data/alternatives.json and writes data/repo-stats.snapshot.json.
//
// Token: GITHUB_TOKEN from the environment or from .env (never committed).
// Max. 5 parallel requests, 2 retries on errors.
// Exit code 1 if a repo is missing (404) or could not be fetched.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(root, 'data', 'alternatives.json');
const OUT = join(root, 'data', 'repo-stats.snapshot.json');
const CONCURRENCY = 5;
const RETRIES = 2;

function loadEnvToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  const envFile = join(root, '.env');
  if (!existsSync(envFile)) return null;
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*GITHUB_TOKEN\s*=\s*["']?([^"'\s]+)["']?\s*$/);
    if (m) return m[1];
  }
  return null;
}

const token = loadEnvToken();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class NotFound extends Error {}

async function gh(path) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'GratisStatt-fetch-stats',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let lastError;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** attempt);
    try {
      const res = await fetch(`https://api.github.com${path}`, { headers });
      if (res.status === 404) throw new NotFound(path);
      if ((res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0') {
        const reset = new Date(Number(res.headers.get('x-ratelimit-reset')) * 1000);
        throw Object.assign(new Error(`GitHub-Limit erreicht (zurückgesetzt um ${reset.toLocaleTimeString('de-CH')})`), {
          fatal: true,
        });
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} für ${path}`);
      return await res.json();
    } catch (err) {
      if (err instanceof NotFound || err.fatal) throw err;
      lastError = err;
    }
  }
  throw lastError;
}

function toStats(repo, release) {
  const spdx = repo.license?.spdx_id;
  return {
    stars: repo.stargazers_count ?? 0,
    pushedAt: repo.pushed_at ?? null,
    license: spdx && spdx !== 'NOASSERTION' ? spdx : (repo.license?.name ?? null),
    description: repo.description ?? null,
    homepage: repo.homepage || null,
    archived: Boolean(repo.archived),
    topics: Array.isArray(repo.topics) ? repo.topics : [],
    latestRelease: release
      ? {
          tag: release.tag_name ?? '',
          date: release.published_at ?? release.created_at ?? null,
          assets: (release.assets ?? []).map((a) => ({ name: a.name, size: a.size ?? 0, url: a.browser_download_url })),
        }
      : null,
  };
}

async function main() {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  const repos = [...new Set(data.products.flatMap((p) => p.alternatives.map((a) => a.repo)))].sort((a, b) =>
    a.localeCompare(b),
  );
  const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { repos: {} };

  if (!token) {
    console.warn(
      `⚠  Kein GITHUB_TOKEN gefunden (.env oder Umgebung). Ohne Token erlaubt GitHub nur 60 Anfragen pro Stunde,\n` +
        `   gebraucht werden etwa ${repos.length * 2}. Lege eine .env mit GITHUB_TOKEN=... an.\n`,
    );
  }
  console.log(`Hole Daten für ${repos.length} Repos …`);

  const result = {};
  const missing = [];
  const renamed = [];
  const archived = [];
  const failed = [];
  let fatal = null;
  let index = 0;
  let done = 0;

  async function worker() {
    while (index < repos.length && !fatal) {
      const name = repos[index++];
      try {
        const repo = await gh(`/repos/${name}`);
        let release = null;
        try {
          release = await gh(`/repos/${name}/releases/latest`);
        } catch (err) {
          if (!(err instanceof NotFound)) throw err;
        }
        if (repo.full_name && repo.full_name.toLowerCase() !== name.toLowerCase()) {
          renamed.push(`${name} → ${repo.full_name}`);
        }
        if (repo.archived) archived.push(name);
        result[name] = toStats(repo, release);
      } catch (err) {
        if (err instanceof NotFound) missing.push(name);
        else if (err.fatal) fatal = err;
        else failed.push(`${name}: ${err.message}`);
        if (previous.repos?.[name]) result[name] = previous.repos[name];
      }
      done++;
      if (done % 10 === 0 || done === repos.length) process.stdout.write(`  ${done}/${repos.length}\n`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (fatal) {
    console.error(`\n✖ ${fatal.message}. Snapshot wurde NICHT geschrieben.`);
    process.exit(1);
  }

  const sorted = Object.fromEntries(Object.keys(result).sort((a, b) => a.localeCompare(b)).map((k) => [k, result[k]]));
  writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), source: 'full', repos: sorted }, null, 2) + '\n');
  console.log(`\n✔ ${Object.keys(sorted).length} Repos in ${OUT.replace(root + '/', '')} geschrieben.`);

  const section = (title, list) => {
    if (list.length === 0) return;
    console.log(`\n${title} (${list.length}):`);
    for (const l of list) console.log(`  - ${l}`);
  };
  section('✖ Fehlende Repos (404) – bitte in data/alternatives.json korrigieren', missing);
  section('↪ Umbenannte Repos (Redirect) – bitte neuen Namen eintragen', renamed);
  section('🗄 Archivierte Repos – werden nicht mehr gepflegt', archived);
  section('⚠ Fehler beim Abrufen (alte Daten behalten)', failed);

  if (missing.length > 0 || failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
