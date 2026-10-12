import Database from 'better-sqlite3';
import { copyFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import topicMapJson from '../../data/topic-map.json';
import { configure, getMeta, migrate, repoCount, setMeta, upsertRepos, type Db, type RepoRow } from '../shared/crawler/store';
import { newlyDiscovered, registerFunctions, repoById, reposByFullName, searchRepos, type SearchParams, type TopicMap } from '../shared/db/search';
import {
  clearMyVotes,
  ratingSummary,
  removeOwnReview,
  reviewsForRepo,
  saveOwnReview,
  setLocalReply,
  setMyVote,
  type Review,
} from '../shared/db/reviews';
import type { DbStats } from '../shared/types';

const topicMap = topicMapJson as TopicMap;

export interface OpenResult {
  db: AppDatabase;
  /** Set when the bundled base is newer than the one in the user's database. */
  baseToMerge: { file: string; version: string } | null;
}

function readBaseVersion(file: string): string | null {
  if (!existsSync(file)) return null;
  const d = new Database(file, { readonly: true, fileMustExist: true });
  try {
    return getMeta(d, 'base_version');
  } catch {
    return null;
  } finally {
    d.close();
  }
}

export class AppDatabase {
  private constructor(
    readonly db: Db,
    readonly path: string,
  ) {}

  /**
   * Opens moatly.db. On the very first start the bundled base.db is copied.
   * Before each schema migration a backup copy is made.
   */
  static open(userDataDir: string, bundledBase: string): OpenResult {
    const path = join(userDataDir, 'moatly.db');
    const firstStart = !existsSync(path);
    if (firstStart && existsSync(bundledBase)) copyFileSync(bundledBase, path);

    const db = new Database(path);
    configure(db);
    migrate(db, (fromVersion) => {
      db.pragma('wal_checkpoint(TRUNCATE)');
      copyFileSync(path, join(userDataDir, `moatly.backup-v${fromVersion}-${Date.now()}.db`));
    });
    registerFunctions(db);

    const bundledVersion = readBaseVersion(bundledBase);
    const localVersion = getMeta(db, 'base_version');
    const baseToMerge =
      bundledVersion && (!localVersion || bundledVersion > localVersion) ? { file: bundledBase, version: bundledVersion } : null;
    return { db: new AppDatabase(db, path), baseToMerge };
  }

  search(params: SearchParams) {
    return searchRepos(this.db, params, topicMap);
  }

  curated(names: string[]) {
    return reposByFullName(this.db, names);
  }

  newlyDiscovered(limit = 12) {
    return newlyDiscovered(this.db, limit);
  }

  repoDetails(id: number) {
    return { repo: repoById(this.db, id), reviews: reviewsForRepo(this.db, id), summary: ratingSummary(this.db, id) };
  }

  saveOwnReview(r: Omit<Review, 'votes' | 'reply_text' | 'reply_author' | 'reply_day'>) {
    saveOwnReview(this.db, r);
  }

  removeOwnReview(repoId: number, author: string) {
    removeOwnReview(this.db, repoId, author);
  }

  setMyVote(reviewId: number, on: boolean) {
    setMyVote(this.db, reviewId, on);
  }

  setLocalReply(reviewId: number, text: string | null, author: string | null, day: string | null) {
    setLocalReply(this.db, reviewId, text, author, day);
  }

  /** After leaving the network: own reviews, answers and upvotes disappear locally too. */
  forgetMemberReviews(login: string) {
    this.db.transaction(() => {
      for (const id of this.db.prepare('SELECT review_id FROM my_votes').pluck().all() as number[]) setMyVote(this.db, id, false);
      clearMyVotes(this.db);
      this.db.prepare('DELETE FROM reviews WHERE author = ? COLLATE NOCASE').run(login);
      this.db.prepare('UPDATE reviews SET reply_text = NULL, reply_author = NULL, reply_day = NULL WHERE reply_author = ? COLLATE NOCASE').run(login);
    })();
  }

  getMeta(key: string) {
    return getMeta(this.db, key);
  }

  setMeta(key: string, value: string | null) {
    setMeta(this.db, key, value);
  }

  /** Stores live finds. Returns the ids that were not in the database before. */
  storeLive(rows: RepoRow[]): number[] {
    const exists = this.db.prepare('SELECT 1 FROM repos WHERE id = ?').pluck();
    const fresh = rows.filter((r) => !exists.get(r.id)).map((r) => r.id);
    upsertRepos(this.db, rows, 'live');
    return fresh;
  }

  /** Live finds that did not come from the base or an update package. */
  queueSubmissions(ids: number[]) {
    if (ids.length === 0) return;
    const sources = this.db.prepare('SELECT source FROM repos WHERE id = ?').pluck();
    const insert = this.db.prepare('INSERT OR IGNORE INTO pending_submissions (repo_id, found_at) VALUES (?, ?)');
    const now = new Date().toISOString();
    this.db.transaction(() => {
      for (const id of ids) {
        const src = sources.get(id);
        if (src === 'live' || src === 'manual') insert.run(id, now);
      }
    })();
  }

  pendingSubmissions(limit = 50): number[] {
    return this.db.prepare('SELECT repo_id FROM pending_submissions ORDER BY found_at LIMIT ?').pluck().all(limit) as number[];
  }

  removeSubmissions(ids: number[]) {
    const del = this.db.prepare('DELETE FROM pending_submissions WHERE repo_id = ?');
    this.db.transaction(() => ids.forEach((id) => del.run(id)))();
  }

  clearSubmissions() {
    this.db.prepare('DELETE FROM pending_submissions').run();
  }

  pausedManualRun(): number | null {
    const id = this.db
      .prepare("SELECT id FROM sync_runs WHERE kind = 'manual' AND status IN ('paused', 'running') ORDER BY id DESC LIMIT 1")
      .pluck()
      .get() as number | undefined;
    return id ?? null;
  }

  stats(): DbStats {
    let sizeBytes = 0;
    for (const f of [this.path, `${this.path}-wal`]) if (existsSync(f)) sizeBytes += statSync(f).size;
    let applied: string[] = [];
    try {
      applied = JSON.parse(this.getMeta('applied_deltas') ?? '[]');
    } catch {
      /* ignore */
    }
    const base = this.getMeta('base_version');
    const manual = this.getMeta('last_manual_update');
    const lastDelta = this.getMeta('last_delta_date');
    const candidates = [base, lastDelta, manual?.slice(0, 10)].filter((x): x is string => !!x).sort();
    return {
      count: repoCount(this.db),
      sizeBytes,
      baseVersion: base,
      appliedDeltas: applied,
      lastUpdateCheck: this.getMeta('last_update_check'),
      dataDate: candidates.at(-1) ?? null,
      pending: this.db.prepare('SELECT count(*) FROM pending_submissions').pluck().get() as number,
    };
  }

  close() {
    this.db.close();
  }
}
