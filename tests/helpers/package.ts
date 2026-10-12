import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGE_SCHEMA_SQL, toRepoRow } from '../../src/shared/crawler';
import type { PackageEntry } from '../../src/main/sync/packages';
import { makeRepos } from './fake-github';

/** Writes an update package with repos [from..to] and returns its manifest entry. */
export function writePackage(dir: string, date: string, from: number, to: number, stars = 500, kind = 'delta'): PackageEntry & { path: string } {
  const file = `${kind}-${date}.db`;
  const path = join(dir, file);
  const db = new Database(path);
  db.exec(PACKAGE_SCHEMA_SQL);
  const ins = db.prepare(
    `INSERT INTO repos (id, full_name, name, owner, description, topics, language, license, stars, forks, archived, homepage, html_url, created_at, pushed_at, first_seen_at, last_seen_at, source)
     VALUES (@id, @full_name, @name, @owner, @description, @topics, @language, @license, @stars, @forks, @archived, @homepage, @html_url, @created_at, @pushed_at, @d, @d, 'delta')`,
  );
  const rows = makeRepos(to).map(toRepoRow).slice(from - 1);
  db.transaction(() => rows.forEach((r) => ins.run({ ...r, stars, d: `${date}T06:00:00Z` })))();
  db.close();
  const buf = readFileSync(path);
  return {
    date,
    file,
    path,
    url: `https://github.com/o/moatly-data/releases/download/${kind}-${date}/${file}`,
    count: rows.length,
    size: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex'),
  };
}

export function fakeFileFetch(files: Record<string, Buffer | string>, log: string[] = []): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    log.push(url);
    const body = files[url];
    if (body === undefined) return new Response('not found', { status: 404 });
    return new Response(typeof body === 'string' ? body : new Uint8Array(body), { status: 200 });
  }) as typeof fetch;
}
