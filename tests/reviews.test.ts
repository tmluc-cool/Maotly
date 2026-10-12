import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import topicMap from '../data/topic-map.json';
import { applyPackages } from '../src/main/sync/packages';
import { getMeta, migrate, SCHEMA_SQL, setMeta, toRepoRow, upsertRepos } from '../src/shared/crawler';
import {
  ratingSummary, replaceReviews, reviewsForRepo, sanitizeReviews, saveOwnReview, setMyVote, type Review,
} from '../src/shared/db/reviews';
import { registerFunctions, searchRepos } from '../src/shared/db/search';
import { makeRepos } from './helpers/fake-github';
import { fakeFileFetch } from './helpers/package';

const review = (p: Partial<Review>): Review => ({
  id: 1, repo_id: 1, author: 'alice', rating: 5, text: 'Super', created_day: '2026-10-01', updated_day: '2026-10-01',
  votes: 0, reply_text: null, reply_author: null, reply_day: null, ...p,
});

function db() {
  const d = new Database(':memory:');
  migrate(d);
  registerFunctions(d);
  upsertRepos(d, makeRepos(3).map(toRepoRow), 'base');
  return d;
}

describe('review file validation', () => {
  it('keeps valid reviews and drops anything malformed', () => {
    const ok = review({});
    const list = sanitizeReviews({
      reviews: [
        ok,
        { ...ok, id: 2, rating: 6 },
        { ...ok, id: 3, rating: 2.5 },
        { ...ok, id: 4, author: '<script>' },
        { ...ok, id: 5, text: 'x'.repeat(501) },
        { ...ok, id: 6, text: '' },
        { ...ok, id: -1 },
        { ...ok, id: 7, reply_text: 'Antwort', reply_author: null },
        { ...ok, id: 8, votes: -5, created_day: 'gestern' },
        null,
      ],
    });
    expect(list.map((r) => r.id)).toEqual([1, 7, 8]);
    expect(list[1].reply_text).toBeNull(); // answer without author is dropped
    expect(list[2]).toMatchObject({ votes: 0, created_day: null });
    expect(() => sanitizeReviews({})).toThrow();
  });
});

describe('local reviews', () => {
  it('replaces published reviews but keeps own fresh ones until the package has them', () => {
    const d = db();
    replaceReviews(d, [review({ id: 1 }), review({ id: 2, author: 'bob', rating: 1 })], '2026-10-05');
    saveOwnReview(d, { id: 50, repo_id: 1, author: 'me', rating: 4, text: 'Neu von mir', created_day: '2026-10-10', updated_day: '2026-10-10' });
    expect(reviewsForRepo(d, 1).map((r) => r.id).sort()).toEqual([1, 2, 50]);

    // Next package (same week, before mine was published): bob's review was deleted, mine stays local.
    replaceReviews(d, [review({ id: 1 })], '2026-10-05');
    expect(reviewsForRepo(d, 1).map((r) => [r.id, r.local]).sort((a, b) => a[0] - b[0])).toEqual([[1, 0], [50, 1]]);

    // A later package contains mine → it is no longer marked as local.
    replaceReviews(d, [review({ id: 1 }), review({ id: 50, author: 'me', rating: 4, updated_day: '2026-10-10' })], '2026-10-12');
    expect(reviewsForRepo(d, 1).find((r) => r.id === 50)?.local).toBe(0);
  });

  it('own reviews that never got published (e.g. hidden) disappear with a newer package', () => {
    const d = db();
    saveOwnReview(d, { id: 60, repo_id: 1, author: 'me', rating: 1, text: 'Spam', created_day: '2026-10-01', updated_day: '2026-10-01' });
    replaceReviews(d, [], '2026-10-05');
    expect(reviewsForRepo(d, 1)).toEqual([]);
  });

  it('upvotes count once and are remembered; sorting by votes', () => {
    const d = db();
    replaceReviews(d, [review({ id: 1, votes: 2 }), review({ id: 2, author: 'bob', votes: 5 })], '2026-10-05');
    setMyVote(d, 1, true);
    setMyVote(d, 1, true);
    let list = reviewsForRepo(d, 1);
    expect(list.map((r) => [r.id, r.votes, r.voted])).toEqual([[2, 5, false], [1, 3, true]]);
    setMyVote(d, 1, false);
    list = reviewsForRepo(d, 1);
    expect(list.find((r) => r.id === 1)).toMatchObject({ votes: 2, voted: false });
  });

  it('summarises ratings and shows them in search results', () => {
    const d = db();
    replaceReviews(d, [review({ id: 1, rating: 5 }), review({ id: 2, author: 'bob', rating: 4 }), review({ id: 3, author: 'eve', rating: 1, repo_id: 2 })], '2026-10-05');
    expect(ratingSummary(d, 1)).toEqual({ avg: 4.5, count: 2, distribution: [0, 0, 0, 1, 1] });
    const r = searchRepos(d, { q: '', sort: 'stars' }, topicMap);
    const byId = Object.fromEntries(r.items.map((i) => [i.id, [i.rating_avg, i.rating_count]]));
    expect(byId).toEqual({ 1: [4.5, 2], 2: [1, 1], 3: [null, 0] });
  });
});

describe('database upgrade to version 2', () => {
  it('adds the review tables to an existing database and makes one backup first', () => {
    const d = new Database(':memory:');
    d.exec(SCHEMA_SQL);
    setMeta(d, 'schema_version', '1');
    upsertRepos(d, makeRepos(2).map(toRepoRow), 'base');
    const backups: number[] = [];
    migrate(d, (v) => backups.push(v));
    expect(backups).toEqual([1]);
    expect(getMeta(d, 'schema_version')).toBe('2');
    expect(d.prepare('SELECT count(*) FROM repos').pluck().get()).toBe(2);
    expect(() => d.prepare('SELECT * FROM reviews').all()).not.toThrow();
  });
});

describe('reviews in the weekly package', () => {
  it('loads reviews.json once (checked by SHA-256) and replaces the local copy', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gs-rv-'));
    const d = db();
    setMeta(d, 'base_version', '2026-10-01');
    const file = join(dir, 'reviews.json');
    writeFileSync(file, JSON.stringify({ reviews: [review({ id: 1 }), review({ id: 2, author: 'bob' })] }));
    const buf = readFileSync(file);
    const url = 'https://github.com/o/gratisstatt-data/releases/download/delta-2026-10-12/reviews.json';
    const entry = { date: '2026-10-12', file: 'reviews.json', url, count: 2, size: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
    const MANIFEST = 'https://github.com/o/gratisstatt-data/releases/latest/download/manifest.json';
    const log: string[] = [];
    const fetchFn = fakeFileFetch({ [MANIFEST]: JSON.stringify({ version: 1, generated_at: '', deltas: [], reviews: entry }), [url]: buf }, log);

    const r = await applyPackages({ db: d, fetch: fetchFn, manifestUrl: MANIFEST, tmpDir: join(dir, 'tmp'), maxMissing: 12 });
    expect(r.reviews).toBe(2);
    expect(reviewsForRepo(d, 1)).toHaveLength(2);

    // Same file again: not downloaded a second time.
    log.length = 0;
    const again = await applyPackages({ db: d, fetch: fetchFn, manifestUrl: MANIFEST, tmpDir: join(dir, 'tmp'), maxMissing: 12 });
    expect(again.reviews).toBeNull();
    expect(log).toEqual([MANIFEST]);

    // A manipulated file is refused.
    const bad = { ...entry, sha256: 'a'.repeat(64) };
    const fetchBad = fakeFileFetch({ [MANIFEST]: JSON.stringify({ version: 1, generated_at: '', deltas: [], reviews: bad }), [url]: buf });
    await expect(applyPackages({ db: d, fetch: fetchBad, manifestUrl: MANIFEST, tmpDir: join(dir, 'tmp'), maxMissing: 12 })).rejects.toThrow(/Prüfsumme/);
  });
});
