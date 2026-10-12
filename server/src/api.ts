import { z } from 'zod';
import type { Deps, Env } from './types';
import { addMonths, bearer, day, error, json, randomToken, safeEqual, sha256Hex } from './util';

export const MAX_PER_REQUEST = 50;
export const MAX_PER_DAY = 200;

const RegisterBody = z.object({ githubToken: z.string().min(10).max(255).regex(/^[A-Za-z0-9_]+$/) });
const HeartbeatBody = z.object({ appVersion: z.string().min(1).max(32).regex(/^[0-9A-Za-z.+-]+$/) });
const SubmissionsBody = z.object({
  repoIds: z.array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)).min(1).max(MAX_PER_REQUEST),
});
const ResultBody = z.object({
  results: z
    .array(
      z.object({
        repoId: z.number().int().positive(),
        status: z.enum(['accepted', 'rejected']),
        reason: z.string().max(200).optional(),
        repoName: z.string().max(200).regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/).optional(),
      }),
    )
    .max(1000),
});

interface UserRow {
  github_id: number;
  login: string;
  app_version: string | null;
  joined_day: string;
  last_active_day: string;
  submissions: number;
  status: 'active' | 'blocked';
}

async function readJson(req: Request): Promise<unknown> {
  const len = Number(req.headers.get('Content-Length') ?? 0);
  if (len > 64 * 1024) throw new Error('too large');
  const text = await req.text();
  if (text.length > 64 * 1024) throw new Error('too large');
  return JSON.parse(text);
}

async function parse<T>(req: Request, schema: z.ZodType<T>): Promise<T | Response> {
  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return error(400, 'Ungültige Anfrage');
  }
  const r = schema.safeParse(body);
  return r.success ? r.data : error(400, 'Ungültige Daten');
}

async function currentUser(req: Request, env: Env): Promise<UserRow | null> {
  const token = bearer(req);
  if (!token || token.length > 100) return null;
  return env.DB.prepare(
    'SELECT github_id, login, app_version, joined_day, last_active_day, submissions, status FROM users WHERE session_hash = ?',
  )
    .bind(await sha256Hex(token))
    .first<UserRow>();
}

/** POST /v1/register – checks the GitHub token once, never stores it. Returns our own session token. */
async function register(req: Request, env: Env, deps: Deps): Promise<Response> {
  const body = await parse(req, RegisterBody);
  if (body instanceof Response) return body;

  const gh = await deps.fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${body.githubToken}`, Accept: 'application/vnd.github+json', 'User-Agent': 'GratisStatt-Server' },
  });
  if (!gh.ok) return error(401, 'GitHub-Anmeldung ungültig');
  const user = (await gh.json()) as { id?: number; login?: string };
  if (!Number.isInteger(user.id) || typeof user.login !== 'string') return error(401, 'GitHub-Anmeldung ungültig');

  const session = randomToken();
  const today = day(deps.now());
  // Re-registering (e.g. new computer) replaces the session. A block stays in place.
  await env.DB.prepare(
    `INSERT INTO users (github_id, login, joined_day, last_active_day, session_hash) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(github_id) DO UPDATE SET login = excluded.login, last_active_day = excluded.last_active_day, session_hash = excluded.session_hash`,
  )
    .bind(user.id, user.login, today, today, await sha256Hex(session))
    .run();
  const row = await env.DB.prepare('SELECT joined_day FROM users WHERE github_id = ?').bind(user.id).first<{ joined_day: string }>();
  return json({ sessionToken: session, login: user.login, joinedDay: row?.joined_day ?? today });
}

async function heartbeat(req: Request, env: Env, deps: Deps, user: UserRow): Promise<Response> {
  const body = await parse(req, HeartbeatBody);
  if (body instanceof Response) return body;
  await env.DB.prepare('UPDATE users SET app_version = ?, last_active_day = ? WHERE github_id = ?')
    .bind(body.appVersion, day(deps.now()), user.github_id)
    .run();
  return json({ ok: true });
}

async function submit(req: Request, env: Env, deps: Deps, user: UserRow): Promise<Response> {
  const body = await parse(req, SubmissionsBody);
  if (body instanceof Response) return body;
  // Blocked users get a normal answer, but their submissions are ignored.
  if (user.status === 'blocked') return json({ accepted: 0 });

  const today = day(deps.now());
  const used = (await env.DB.prepare('SELECT count(*) AS n FROM submissions WHERE github_id = ? AND submitted_day = ?')
    .bind(user.github_id, today)
    .first<{ n: number }>())!.n;
  const room = MAX_PER_DAY - used;
  if (room <= 0) return error(429, 'Tageslimit erreicht');

  const ids = [...new Set(body.repoIds)].slice(0, room);
  const results = await env.DB.batch(
    ids.map((id) =>
      env.DB.prepare('INSERT OR IGNORE INTO submissions (repo_id, github_id, submitted_day) VALUES (?, ?, ?)').bind(id, user.github_id, today),
    ),
  );
  const inserted = results.reduce((n, r) => n + (r.meta.changes ?? 0), 0);
  await env.DB.prepare('UPDATE users SET submissions = submissions + ?, last_active_day = ? WHERE github_id = ?')
    .bind(inserted, today, user.github_id)
    .run();
  return json({ accepted: inserted });
}

async function me(env: Env, user: UserRow): Promise<Response> {
  const pending = await env.DB.prepare("SELECT count(*) AS n FROM submissions WHERE github_id = ? AND status = 'pending'")
    .bind(user.github_id)
    .first<{ n: number }>();
  return json({
    login: user.login,
    appVersion: user.app_version,
    joinedDay: user.joined_day,
    lastActiveDay: user.last_active_day,
    submissions: user.submissions,
    status: user.status,
    pendingSubmissions: pending?.n ?? 0,
  });
}

/** Deletes a user and their open submissions. */
export async function deleteUser(env: Env, githubId: number) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM submissions WHERE github_id = ? AND status = 'pending'").bind(githubId),
    env.DB.prepare('DELETE FROM users WHERE github_id = ?').bind(githubId),
  ]);
}

async function isAdminSecret(req: Request, env: Env): Promise<boolean> {
  const token = bearer(req);
  return !!token && !!env.ADMIN_SECRET && env.ADMIN_SECRET.length >= 32 && (await safeEqual(token, env.ADMIN_SECRET));
}

/** GET /v1/admin/submissions?status=pending – repo ids waiting for the weekly check (only from active users). */
async function adminSubmissions(req: Request, env: Env): Promise<Response> {
  const status = new URL(req.url).searchParams.get('status') ?? 'pending';
  if (!['pending', 'accepted', 'rejected'].includes(status)) return error(400, 'Ungültiger Status');
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT s.repo_id FROM submissions s JOIN users u ON u.github_id = s.github_id
     WHERE s.status = ? AND u.status = 'active' ORDER BY s.repo_id LIMIT 5000`,
  )
    .bind(status)
    .all<{ repo_id: number }>();
  return json({ repoIds: results.map((r) => r.repo_id) });
}

/** POST /v1/admin/submissions/result – the weekly check reports accepted/rejected per repo. */
async function adminResult(req: Request, env: Env): Promise<Response> {
  const body = await parse(req, ResultBody);
  if (body instanceof Response) return body;
  if (body.results.length) {
    await env.DB.batch(
      body.results.map((r) =>
        env.DB.prepare("UPDATE submissions SET status = ?, reason = ?, repo_name = ? WHERE repo_id = ? AND status = 'pending'").bind(
          r.status,
          r.reason ?? null,
          r.repoName ?? null,
          r.repoId,
        ),
      ),
    );
  }
  return json({ ok: true, updated: body.results.length });
}

export async function handleApi(req: Request, env: Env, deps: Deps): Promise<Response> {
  const { pathname } = new URL(req.url);
  const route = `${req.method} ${pathname}`;

  if (route === 'POST /v1/register') return register(req, env, deps);

  if (pathname.startsWith('/v1/admin/')) {
    if (!(await isAdminSecret(req, env))) return error(401, 'Nicht erlaubt');
    if (route === 'GET /v1/admin/submissions') return adminSubmissions(req, env);
    if (route === 'POST /v1/admin/submissions/result') return adminResult(req, env);
    return error(404, 'Nicht gefunden');
  }

  const user = await currentUser(req, env);
  if (!user) return error(401, 'Nicht angemeldet');
  switch (route) {
    case 'POST /v1/heartbeat':
      return heartbeat(req, env, deps, user);
    case 'POST /v1/submissions':
      return submit(req, env, deps, user);
    case 'GET /v1/me':
      return me(env, user);
    case 'DELETE /v1/me':
      await deleteUser(env, user.github_id);
      return json({ ok: true });
    default:
      return error(404, 'Nicht gefunden');
  }
}

/** Daily cron: members without activity for 12 months are deleted automatically. */
export async function cleanupInactive(env: Env, now: number): Promise<number> {
  const cutoff = addMonths(day(now), -12);
  const { results } = await env.DB.prepare('SELECT github_id FROM users WHERE last_active_day < ?').bind(cutoff).all<{ github_id: number }>();
  for (const r of results) await deleteUser(env, r.github_id);
  return results.length;
}
