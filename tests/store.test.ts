import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  configure, getMeta, mergeDatabase, migrate, PACKAGE_SCHEMA_SQL, repoCount, schemaVersion, SCHEMA_VERSION, toRepoRow, upsertRepos,
} from '../src/shared/crawler';
import { makeRepos } from './helpers/fake-github';

const fresh = () => {
  const db = new Database(':memory:');
  migrate(db);
  return db;
};
const fts = (db: Database.Database, q: string) =>
  db.prepare('SELECT rowid FROM repos_fts WHERE repos_fts MATCH ?').pluck().all(q) as number[];

describe('store', () => {
  it('migrates an empty database and records the version', () => {
    const db = new Database(':memory:');
    expect(schemaVersion(db)).toBe(0);
    let backups = 0;
    migrate(db, () => backups++);
    expect(schemaVersion(db)).toBe(SCHEMA_VERSION);
    expect(getMeta(db, 'schema_version')).toBe(String(SCHEMA_VERSION));
    expect(backups).toBe(0); // no backup for a brand-new file
    migrate(db); // idempotent
  });

  it('upserts without overwriting first_seen_at and source, and keeps FTS in sync', () => {
    const db = fresh();
    const [r] = makeRepos(1).map(toRepoRow);
    expect(upsertRepos(db, [r], 'base', '2026-01-01T00:00:00Z')).toEqual({ added: 1, updated: 0 });
    expect(fts(db, 'project')).toEqual([1]);

    const changed = { ...r, description: 'A brand new description', stars: 999 };
    expect(upsertRepos(db, [changed], 'live', '2026-10-01T00:00:00Z')).toEqual({ added: 0, updated: 1 });
    const row = db.prepare('SELECT * FROM repos WHERE id = 1').get() as Record<string, unknown>;
    expect(row.stars).toBe(999);
    expect(row.first_seen_at).toBe('2026-01-01T00:00:00Z');
    expect(row.last_seen_at).toBe('2026-10-01T00:00:00Z');
    expect(row.source).toBe('base');
    expect(fts(db, 'project')).toEqual([]);
    expect(fts(db, 'brand')).toEqual([1]);
  });

  it('only stores public metadata', () => {
    const row = toRepoRow({ ...makeRepos(1)[0], owner: { login: 'x', email: 'secret@example.com' } as never, license: { spdx_id: 'NOASSERTION' } });
    expect(JSON.stringify(row)).not.toContain('secret');
    expect(row.license).toBeNull();
  });

  it('merges an update package in one go and counts new vs. updated', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gs-'));
    const db = new Database(join(dir, 'main.db'));
    configure(db);
    migrate(db);
    upsertRepos(db, makeRepos(10).map(toRepoRow), 'base', '2026-01-01T00:00:00Z');

    const pkgFile = join(dir, 'delta.db');
    const pkg = new Database(pkgFile);
    pkg.exec(PACKAGE_SCHEMA_SQL);
    const ins = pkg.prepare(
      `INSERT INTO repos (id, full_name, name, owner, description, topics, language, license, stars, forks, archived, homepage, html_url, created_at, pushed_at, first_seen_at, last_seen_at, source)
       VALUES (@id, @full_name, @name, @owner, @description, @topics, @language, @license, @stars, @forks, @archived, @homepage, @html_url, @created_at, @pushed_at, 'x', '2026-10-10T00:00:00Z', 'delta')`,
    );
    for (const r of makeRepos(15).map(toRepoRow).slice(5)) ins.run({ ...r, stars: 5000 });
    pkg.close();

    expect(mergeDatabase(db, pkgFile, 'delta', '2026-10-12T00:00:00Z')).toEqual({ added: 5, updated: 5 });
    expect(repoCount(db)).toBe(15);
    const old = db.prepare('SELECT stars, source, first_seen_at FROM repos WHERE id = 6').get() as Record<string, unknown>;
    expect(old).toEqual({ stars: 5000, source: 'base', first_seen_at: '2026-01-01T00:00:00Z' });
    const neu = db.prepare('SELECT source, first_seen_at FROM repos WHERE id = 15').get();
    expect(neu).toEqual({ source: 'delta', first_seen_at: '2026-10-12T00:00:00Z' });
    expect(fts(db, '"number 15"')).toEqual([15]);
    db.close();
  });
});
