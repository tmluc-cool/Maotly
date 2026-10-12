import { z } from 'zod';
import type { D1PreparedStatement, Deps, Env } from './types';
import { day, error, json } from './util';

export const MAX_REVIEW_TEXT = 500;
export const MAX_REVIEWS_PER_DAY = 20;
export const MAX_VOTES_PER_DAY = 200;

export interface ReviewUser {
  github_id: number;
  login: string;
  status: 'active' | 'blocked';
}

// Text: trimmed, no control characters except line breaks.
const ReviewText = z
  .string()
  .transform((s) => s.replace(/\r\n?/g, '\n').trim())
  .pipe(
    z
      .string()
      .min(3)
      .max(MAX_REVIEW_TEXT)
      .refine((s) => !/[\u0000-\u0009\u000b-\u001f\u007f]/.test(s), 'Ungültige Zeichen'),
  );

const ReviewBody = z.object({
  repoId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  rating: z.number().int().min(1).max(5),
  text: ReviewText,
});
const ReplyBody = z.object({
  text: ReviewText,
  githubToken: z.string().min(10).max(255).regex(/^[A-Za-z0-9_]+$/),
});

async function parse<T>(req: Request, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T | Response> {
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > 16 * 1024) return error(400, 'Ungültige Anfrage');
    body = JSON.parse(text);
  } catch {
    return error(400, 'Ungültige Anfrage');
  }
  const r = schema.safeParse(body);
  return r.success ? r.data : error(400, 'Ungültige Daten');
}

const count = async (stmt: D1PreparedStatement) => (await stmt.first<{ n: number }>())?.n ?? 0;

/** POST /v1/reviews – write or edit the own review of a project. */
async function upsertReview(req: Request, env: Env, deps: Deps, user: ReviewUser): Promise<Response> {
  const body = await parse(req, ReviewBody);
  if (body instanceof Response) return body;
  const today = day(deps.now());
  // Blocked members get a normal answer, but nothing is stored.
  if (user.status === 'blocked') return json({ id: null });
  const used = await count(
    env.DB.prepare('SELECT count(*) AS n FROM reviews WHERE github_id = ? AND updated_day = ?').bind(user.github_id, today),
  );
  if (used >= MAX_REVIEWS_PER_DAY) return error(429, 'Tageslimit für Bewertungen erreicht');

  await env.DB.prepare(
    `INSERT INTO reviews (repo_id, github_id, rating, text, created_day, updated_day) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(repo_id, github_id) DO UPDATE SET rating = excluded.rating, text = excluded.text, updated_day = excluded.updated_day`,
  )
    .bind(body.repoId, user.github_id, body.rating, body.text, today, today)
    .run();
  const row = await env.DB.prepare('SELECT id, created_day FROM reviews WHERE repo_id = ? AND github_id = ?')
    .bind(body.repoId, user.github_id)
    .first<{ id: number; created_day: string }>();
  return json({ id: row?.id ?? null, createdDay: row?.created_day ?? today, updatedDay: today });
}

/** Statements that delete reviews (and their votes) matching a WHERE clause on reviews. */
function deleteReviewsWhere(env: Env, where: string, ...args: unknown[]): D1PreparedStatement[] {
  return [
    env.DB.prepare(`DELETE FROM review_votes WHERE review_id IN (SELECT id FROM reviews WHERE ${where})`).bind(...args),
    env.DB.prepare(`DELETE FROM reviews WHERE ${where}`).bind(...args),
  ];
}

/** DELETE /v1/reviews/:repoId – removes the own review. */
async function deleteOwnReview(env: Env, user: ReviewUser, repoId: number): Promise<Response> {
  await env.DB.batch(deleteReviewsWhere(env, 'repo_id = ? AND github_id = ?', repoId, user.github_id));
  return json({ ok: true });
}

/** POST /v1/reviews/:id/vote and DELETE … – one upvote per member, not on the own review. */
async function vote(env: Env, deps: Deps, user: ReviewUser, reviewId: number, on: boolean): Promise<Response> {
  const review = await env.DB.prepare("SELECT github_id FROM reviews WHERE id = ? AND status = 'visible'")
    .bind(reviewId)
    .first<{ github_id: number }>();
  if (!review) return error(404, 'Bewertung nicht gefunden');
  if (review.github_id === user.github_id) return error(400, 'Die eigene Bewertung kann man nicht hochwählen');
  if (user.status === 'blocked') return json({ ok: true });

  if (on) {
    const today = day(deps.now());
    const used = await count(
      env.DB.prepare('SELECT count(*) AS n FROM review_votes WHERE github_id = ? AND voted_day = ?').bind(user.github_id, today),
    );
    if (used >= MAX_VOTES_PER_DAY) return error(429, 'Tageslimit für Upvotes erreicht');
    const r = await env.DB.prepare('INSERT OR IGNORE INTO review_votes (review_id, github_id, voted_day) VALUES (?, ?, ?)')
      .bind(reviewId, user.github_id, today)
      .run();
    if (r.meta.changes) await env.DB.prepare('UPDATE reviews SET votes = votes + 1 WHERE id = ?').bind(reviewId).run();
  } else {
    const r = await env.DB.prepare('DELETE FROM review_votes WHERE review_id = ? AND github_id = ?').bind(reviewId, user.github_id).run();
    if (r.meta.changes) await env.DB.prepare('UPDATE reviews SET votes = max(0, votes - 1) WHERE id = ?').bind(reviewId).run();
  }
  return json({ ok: true });
}

/**
 * POST /v1/reviews/:id/reply – only the owner of the GitHub project may answer.
 * Checked live at GitHub with the member's token (which is not stored):
 * the token must belong to this member, and the member must have admin rights on the repo.
 */
async function reply(req: Request, env: Env, deps: Deps, user: ReviewUser, reviewId: number): Promise<Response> {
  const body = await parse(req, ReplyBody);
  if (body instanceof Response) return body;
  const review = await env.DB.prepare('SELECT repo_id FROM reviews WHERE id = ?').bind(reviewId).first<{ repo_id: number }>();
  if (!review) return error(404, 'Bewertung nicht gefunden');

  const gh = (path: string) =>
    deps.fetch(`https://api.github.com${path}`, {
      headers: { Authorization: `Bearer ${body.githubToken}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Moatly-Server' },
    });
  const me = await gh('/user');
  if (!me.ok) return error(401, 'GitHub-Anmeldung ungültig');
  const meJson = (await me.json()) as { id?: number };
  if (meJson.id !== user.github_id) return error(401, 'GitHub-Anmeldung passt nicht zum Konto');
  const repo = await gh(`/repositories/${review.repo_id}`);
  if (!repo.ok) return error(403, 'Nur der Owner des Projekts kann antworten');
  const r = (await repo.json()) as { owner?: { id?: number }; permissions?: { admin?: boolean } };
  if (!(r.owner?.id === user.github_id || r.permissions?.admin === true)) return error(403, 'Nur der Owner des Projekts kann antworten');
  if (user.status === 'blocked') return json({ ok: true });

  const today = day(deps.now());
  await env.DB.prepare('UPDATE reviews SET reply_text = ?, reply_github_id = ?, reply_day = ? WHERE id = ?')
    .bind(body.text, user.github_id, today, reviewId)
    .run();
  return json({ ok: true, replyDay: today });
}

/** DELETE /v1/reviews/:id/reply – the owner removes their own answer. */
async function deleteReply(env: Env, user: ReviewUser, reviewId: number): Promise<Response> {
  await env.DB.prepare('UPDATE reviews SET reply_text = NULL, reply_github_id = NULL, reply_day = NULL WHERE id = ? AND reply_github_id = ?')
    .bind(reviewId, user.github_id)
    .run();
  return json({ ok: true });
}

/** Routes under /v1/reviews for signed-in members. Returns null if the path is not a review route. */
export async function handleReviews(req: Request, env: Env, deps: Deps, user: ReviewUser): Promise<Response | null> {
  const { pathname } = new URL(req.url);
  if (pathname === '/v1/reviews' && req.method === 'POST') return upsertReview(req, env, deps, user);
  let m = pathname.match(/^\/v1\/reviews\/repo\/(\d{1,16})$/);
  if (m && req.method === 'DELETE') return deleteOwnReview(env, user, Number(m[1]));
  m = pathname.match(/^\/v1\/reviews\/(\d{1,16})\/(vote|reply)$/);
  if (m) {
    const id = Number(m[1]);
    if (m[2] === 'vote' && (req.method === 'POST' || req.method === 'DELETE')) return vote(env, deps, user, id, req.method === 'POST');
    if (m[2] === 'reply' && req.method === 'POST') return reply(req, env, deps, user, id);
    if (m[2] === 'reply' && req.method === 'DELETE') return deleteReply(env, user, id);
  }
  return null;
}

/** Everything of one member that has to go when they leave: reviews, votes (counts adjusted) and answers. */
export function deleteUserReviewData(env: Env, githubId: number): D1PreparedStatement[] {
  return [
    env.DB.prepare(
      'UPDATE reviews SET votes = max(0, votes - 1) WHERE id IN (SELECT review_id FROM review_votes WHERE github_id = ?)',
    ).bind(githubId),
    env.DB.prepare('DELETE FROM review_votes WHERE github_id = ?').bind(githubId),
    ...deleteReviewsWhere(env, 'github_id = ?', githubId),
    env.DB.prepare('UPDATE reviews SET reply_text = NULL, reply_github_id = NULL, reply_day = NULL WHERE reply_github_id = ?').bind(
      githubId,
    ),
  ];
}

export async function reviewCounts(env: Env, githubId: number) {
  return {
    reviews: await count(env.DB.prepare('SELECT count(*) AS n FROM reviews WHERE github_id = ?').bind(githubId)),
    votes: await count(env.DB.prepare('SELECT count(*) AS n FROM review_votes WHERE github_id = ?').bind(githubId)),
  };
}

export interface ExportedReview {
  id: number;
  repo_id: number;
  author: string;
  rating: number;
  text: string;
  created_day: string;
  updated_day: string;
  votes: number;
  reply_text: string | null;
  reply_author: string | null;
  reply_day: string | null;
}

/** GET /v1/admin/reviews – all public reviews for the weekly package (hidden ones and blocked members left out). */
export async function exportReviews(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.repo_id, u.login AS author, r.rating, r.text, r.created_day, r.updated_day, r.votes,
            CASE WHEN ru.status = 'active' THEN r.reply_text END AS reply_text,
            CASE WHEN ru.status = 'active' THEN ru.login END AS reply_author,
            CASE WHEN ru.status = 'active' THEN r.reply_day END AS reply_day
     FROM reviews r
     JOIN users u ON u.github_id = r.github_id AND u.status = 'active'
     LEFT JOIN users ru ON ru.github_id = r.reply_github_id
     WHERE r.status = 'visible'
     ORDER BY r.id
     LIMIT 100000`,
  ).all<ExportedReview>();
  return json({ reviews: results });
}

/** Admin dashboard: newest reviews including hidden ones. */
export async function adminReviewList(env: Env) {
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.repo_id, u.login AS author, r.rating, r.text, r.updated_day, r.status, r.votes, r.reply_text
     FROM reviews r LEFT JOIN users u ON u.github_id = r.github_id
     ORDER BY r.updated_day DESC, r.id DESC LIMIT 200`,
  ).all();
  return results;
}

export async function adminReviewAction(env: Env, id: number, action: 'hide' | 'show' | 'delete') {
  if (action === 'delete') await env.DB.batch(deleteReviewsWhere(env, 'id = ?', id));
  else await env.DB.prepare('UPDATE reviews SET status = ? WHERE id = ?').bind(action === 'hide' ? 'hidden' : 'visible', id).run();
}
