import type { Db } from '../crawler/store';

/** Local copy of the public reviews (replaced completely by each weekly package). */
export const REVIEWS_SQL = `
CREATE TABLE IF NOT EXISTS reviews (
  id           INTEGER PRIMARY KEY,
  repo_id      INTEGER NOT NULL,
  author       TEXT NOT NULL,
  rating       INTEGER NOT NULL,
  text         TEXT NOT NULL,
  created_day  TEXT,
  updated_day  TEXT,
  votes        INTEGER NOT NULL DEFAULT 0,
  reply_text   TEXT,
  reply_author TEXT,
  reply_day    TEXT,
  local        INTEGER NOT NULL DEFAULT 0  -- 1 = written here, not yet in a package
);
CREATE INDEX IF NOT EXISTS reviews_repo ON reviews(repo_id);
CREATE TABLE IF NOT EXISTS my_votes (review_id INTEGER PRIMARY KEY);
`;

export const MAX_REVIEW_TEXT = 500;

export interface Review {
  id: number;
  repo_id: number;
  author: string;
  rating: number;
  text: string;
  created_day: string | null;
  updated_day: string | null;
  votes: number;
  reply_text: string | null;
  reply_author: string | null;
  reply_day: string | null;
}

export interface ReviewWithState extends Review {
  local: number;
  voted: boolean;
}

export interface RatingSummary {
  avg: number;
  count: number;
  /** Number of reviews per star value, index 0 = 1 star. */
  distribution: [number, number, number, number, number];
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const optText = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : null);

/** Validates the reviews file of an update package. Anything malformed is dropped. */
export function sanitizeReviews(json: unknown): Review[] {
  const list = (json as { reviews?: unknown })?.reviews;
  if (!Array.isArray(list)) throw new Error('Invalid reviews file');
  const out: Review[] = [];
  for (const r of list as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object') continue;
    const id = r.id;
    const repoId = r.repo_id;
    const rating = r.rating;
    if (!Number.isSafeInteger(id) || (id as number) <= 0) continue;
    if (!Number.isSafeInteger(repoId) || (repoId as number) <= 0) continue;
    if (!Number.isInteger(rating) || (rating as number) < 1 || (rating as number) > 5) continue;
    if (typeof r.author !== 'string' || !LOGIN.test(r.author)) continue;
    if (typeof r.text !== 'string' || r.text.length === 0 || r.text.length > MAX_REVIEW_TEXT) continue;
    const replyAuthor = typeof r.reply_author === 'string' && LOGIN.test(r.reply_author) ? r.reply_author : null;
    const replyText = replyAuthor ? optText(r.reply_text, MAX_REVIEW_TEXT) : null;
    out.push({
      id: id as number,
      repo_id: repoId as number,
      author: r.author,
      rating: rating as number,
      text: r.text,
      created_day: typeof r.created_day === 'string' && DAY.test(r.created_day) ? r.created_day : null,
      updated_day: typeof r.updated_day === 'string' && DAY.test(r.updated_day) ? r.updated_day : null,
      votes: Number.isSafeInteger(r.votes) && (r.votes as number) >= 0 ? (r.votes as number) : 0,
      reply_text: replyText,
      reply_author: replyText ? replyAuthor : null,
      reply_day: replyText && typeof r.reply_day === 'string' && DAY.test(r.reply_day) ? r.reply_day : null,
    });
  }
  return out;
}

/**
 * Replaces all published reviews with the ones of a package (one transaction).
 * Own reviews written here stay until the package contains them or they are older than the package.
 */
export function replaceReviews(db: Db, reviews: Review[], packageDay: string): number {
  const ins = db.prepare(
    `INSERT OR REPLACE INTO reviews (id, repo_id, author, rating, text, created_day, updated_day, votes, reply_text, reply_author, reply_day, local)
     VALUES (@id, @repo_id, @author, @rating, @text, @created_day, @updated_day, @votes, @reply_text, @reply_author, @reply_day, 0)`,
  );
  db.transaction(() => {
    db.prepare('DELETE FROM reviews WHERE local = 0').run();
    db.prepare('DELETE FROM reviews WHERE local = 1 AND (updated_day IS NULL OR updated_day < ?)').run(packageDay);
    for (const r of reviews) ins.run(r);
    // Votes for reviews that no longer exist are forgotten.
    db.prepare('DELETE FROM my_votes WHERE review_id NOT IN (SELECT id FROM reviews)').run();
  })();
  return reviews.length;
}

export function reviewsForRepo(db: Db, repoId: number, sort: 'top' | 'new' = 'top'): ReviewWithState[] {
  const order = sort === 'new' ? 'r.updated_day DESC, r.id DESC' : 'r.votes DESC, r.updated_day DESC, r.id DESC';
  const rows = db
    .prepare(
      `SELECT r.*, (m.review_id IS NOT NULL) AS voted FROM reviews r LEFT JOIN my_votes m ON m.review_id = r.id
       WHERE r.repo_id = ? ORDER BY ${order} LIMIT 500`,
    )
    .all(repoId) as (Review & { local: number; voted: number })[];
  return rows.map((r) => ({ ...r, voted: !!r.voted }));
}

export function ratingSummary(db: Db, repoId: number): RatingSummary {
  const rows = db.prepare('SELECT rating, count(*) AS n FROM reviews WHERE repo_id = ? GROUP BY rating').all(repoId) as { rating: number; n: number }[];
  const distribution: RatingSummary['distribution'] = [0, 0, 0, 0, 0];
  let sum = 0;
  let count = 0;
  for (const r of rows) {
    if (r.rating >= 1 && r.rating <= 5) {
      distribution[r.rating - 1] = r.n;
      sum += r.rating * r.n;
      count += r.n;
    }
  }
  return { avg: count ? Math.round((sum / count) * 10) / 10 : 0, count, distribution };
}

/** Average and count for many repos at once (for result lists). */
export function ratingsFor(db: Db, repoIds: number[]): Map<number, { avg: number; count: number }> {
  const out = new Map<number, { avg: number; count: number }>();
  if (repoIds.length === 0) return out;
  const rows = db
    .prepare(
      `SELECT repo_id, round(avg(rating), 1) AS avg, count(*) AS count FROM reviews
       WHERE repo_id IN (SELECT value FROM json_each(?)) GROUP BY repo_id`,
    )
    .all(JSON.stringify(repoIds)) as { repo_id: number; avg: number; count: number }[];
  for (const r of rows) out.set(r.repo_id, { avg: r.avg, count: r.count });
  return out;
}

/** Shows an own review right away (until the next package brings the published version). */
export function saveOwnReview(db: Db, r: Omit<Review, 'votes' | 'reply_text' | 'reply_author' | 'reply_day'>) {
  db.prepare(
    `INSERT INTO reviews (id, repo_id, author, rating, text, created_day, updated_day, votes, local)
     VALUES (@id, @repo_id, @author, @rating, @text, @created_day, @updated_day, 0, 1)
     ON CONFLICT(id) DO UPDATE SET rating = excluded.rating, text = excluded.text, updated_day = excluded.updated_day`,
  ).run(r);
}

export function removeOwnReview(db: Db, repoId: number, author: string) {
  db.prepare('DELETE FROM reviews WHERE repo_id = ? AND author = ? COLLATE NOCASE').run(repoId, author);
}

export function setMyVote(db: Db, reviewId: number, on: boolean) {
  db.transaction(() => {
    if (on) {
      const r = db.prepare('INSERT OR IGNORE INTO my_votes (review_id) VALUES (?)').run(reviewId);
      if (r.changes) db.prepare('UPDATE reviews SET votes = votes + 1 WHERE id = ?').run(reviewId);
    } else {
      const r = db.prepare('DELETE FROM my_votes WHERE review_id = ?').run(reviewId);
      if (r.changes) db.prepare('UPDATE reviews SET votes = max(0, votes - 1) WHERE id = ?').run(reviewId);
    }
  })();
}

export function setLocalReply(db: Db, reviewId: number, text: string | null, author: string | null, day: string | null) {
  db.prepare('UPDATE reviews SET reply_text = ?, reply_author = ?, reply_day = ? WHERE id = ?').run(text, author, day, reviewId);
}

export function clearMyVotes(db: Db) {
  db.prepare('DELETE FROM my_votes').run();
}
