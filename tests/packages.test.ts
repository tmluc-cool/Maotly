import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getMeta, migrate, repoCount, setMeta, toRepoRow, upsertRepos } from '../src/shared/crawler';
import { applyPackages, ChecksumError, missingDeltas, parseManifest, type Manifest } from '../src/main/sync/packages';
import { makeRepos } from './helpers/fake-github';
import { fakeFileFetch, writePackage } from './helpers/package';

const MANIFEST = 'https://github.com/o/gratisstatt-data/releases/latest/download/manifest.json';

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'gs-pkg-'));
  const db = new Database(join(dir, 'main.db'));
  migrate(db);
  upsertRepos(db, makeRepos(10).map(toRepoRow), 'base', '2026-09-01T00:00:00Z');
  setMeta(db, 'base_version', '2026-09-01');
  return { dir, db };
}

describe('manifest', () => {
  it('drops entries with bad dates, hashes or foreign hosts and sorts by date', () => {
    const good = { date: '2026-10-05', file: 'a.db', url: 'https://github.com/x/y/a.db', count: 1, size: 1, sha256: 'a'.repeat(64) };
    const m = parseManifest({
      version: 1,
      generated_at: '',
      deltas: [
        { ...good, date: '2026-10-12' },
        good,
        { ...good, url: 'https://evil.example.com/a.db' },
        { ...good, url: 'http://github.com/a.db' },
        { ...good, sha256: 'nope' },
      ],
    });
    expect(m.deltas.map((d) => d.date)).toEqual(['2026-10-05', '2026-10-12']);
    expect(() => parseManifest({ version: 2, deltas: [] })).toThrow();
  });

  it('only lists packages newer than the base and not yet applied', () => {
    const e = (date: string) => ({ date, file: '', url: '', count: 0, size: 0, sha256: '' });
    const m = { version: 1, generated_at: '', deltas: ['2026-08-25', '2026-09-08', '2026-09-15', '2026-09-22'].map(e) } as Manifest;
    expect(missingDeltas(m, ['2026-09-08'], '2026-09-01').map((d) => d.date)).toEqual(['2026-09-15', '2026-09-22']);
  });
});

describe('applyPackages', () => {
  it('downloads, verifies and merges missing packages in order', async () => {
    const { dir, db } = setup();
    const p1 = writePackage(dir, '2026-09-08', 5, 15); // 5 known, 5..15 → 6 new
    const p2 = writePackage(dir, '2026-09-15', 14, 20, 900);
    const manifest = { version: 1, generated_at: '', deltas: [p2, p1] };
    const log: string[] = [];
    const fetchFn = fakeFileFetch({ [MANIFEST]: JSON.stringify(manifest), [p1.url]: readFileSync(p1.path), [p2.url]: readFileSync(p2.path) }, log);

    const r = await applyPackages({ db, fetch: fetchFn, manifestUrl: MANIFEST, tmpDir: join(dir, 'tmp'), maxMissing: 12, now: () => '2026-10-12T00:00:00Z' });
    expect(r.applied).toEqual(['2026-09-08', '2026-09-15']);
    expect(r.added).toBe(10);
    expect(repoCount(db)).toBe(20);
    expect(log.indexOf(p1.url)).toBeLessThan(log.indexOf(p2.url));
    expect(JSON.parse(getMeta(db, 'applied_deltas')!)).toEqual(['2026-09-08', '2026-09-15']);
    expect(getMeta(db, 'last_delta_date')).toBe('2026-09-15');
    expect(db.prepare('SELECT source, stars FROM repos WHERE id = 5').get()).toEqual({ source: 'base', stars: 500 });
    expect(db.prepare('SELECT source FROM repos WHERE id = 20').pluck().get()).toBe('delta');

    // Running again downloads nothing.
    log.length = 0;
    const again = await applyPackages({ db, fetch: fetchFn, manifestUrl: MANIFEST, tmpDir: join(dir, 'tmp'), maxMissing: 12 });
    expect(again.applied).toEqual([]);
    expect(log).toEqual([MANIFEST]);
  });

  it('refuses a package whose checksum does not match and merges nothing', async () => {
    const { dir, db } = setup();
    const p1 = writePackage(dir, '2026-09-08', 11, 15);
    const manifest = { version: 1, generated_at: '', deltas: [{ ...p1, sha256: 'f'.repeat(64) }] };
    const fetchFn = fakeFileFetch({ [MANIFEST]: JSON.stringify(manifest), [p1.url]: readFileSync(p1.path) });
    await expect(
      applyPackages({ db, fetch: fetchFn, manifestUrl: MANIFEST, tmpDir: join(dir, 'tmp'), maxMissing: 12 }),
    ).rejects.toBeInstanceOf(ChecksumError);
    expect(repoCount(db)).toBe(10);
    expect(getMeta(db, 'applied_deltas')).toBeNull();
  });

  it('loads the newest base instead when more than 12 packages are missing', async () => {
    const { dir, db } = setup();
    const deltas = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 8, 7 + i * 7)).toISOString().slice(0, 10);
      return writePackage(dir, d, 11 + i, 11 + i);
    });
    const base = writePackage(dir, deltas[12].date, 1, 40, 700, 'base');
    const manifest = { version: 1, generated_at: '', deltas, latest_base: base };
    const files: Record<string, Buffer | string> = { [MANIFEST]: JSON.stringify(manifest), [base.url]: readFileSync(base.path) };
    for (const d of deltas) files[d.url] = readFileSync(d.path);
    const log: string[] = [];

    const r = await applyPackages({ db, fetch: fakeFileFetch(files, log), manifestUrl: MANIFEST, tmpDir: join(dir, 'tmp'), maxMissing: 12 });
    expect(r.usedBase).toBe(deltas[12].date);
    expect(r.applied).toEqual([deltas[13].date]); // only the package after the base
    expect(log.filter((u) => u.includes('/delta-')).length).toBe(1);
    expect(getMeta(db, 'base_version')).toBe(deltas[12].date);
    expect(repoCount(db)).toBe(40);
    expect(db.prepare('SELECT first_seen_at FROM repos WHERE id = 1').pluck().get()).toBe('2026-09-01T00:00:00Z');
  });

  it('does nothing while no manifest is published', async () => {
    const { dir, db } = setup();
    const r = await applyPackages({ db, fetch: fakeFileFetch({}), manifestUrl: MANIFEST, tmpDir: join(dir, 'tmp'), maxMissing: 12 });
    expect(r).toEqual({ applied: [], usedBase: null, added: 0, updated: 0 });
  });
});
