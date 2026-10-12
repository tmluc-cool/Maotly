import { DASHBOARD_HTML, DASHBOARD_JS, LOGIN_HTML } from './admin-page';
import { deleteUser } from './api';
import { adminReviewAction, adminReviewList } from './reviews';
import type { Deps, Env } from './types';
import { addDays, cookies, day, error, html, json, randomToken, sign, verify } from './util';

const COOKIE = 'gs_admin';
const STATE_COOKIE = 'gs_state';
const SESSION_HOURS = 12;
const PAGE_CSP =
  "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

interface AdminSession {
  id: number;
  exp: number;
}

function cookie(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

async function session(req: Request, env: Env, now: number): Promise<AdminSession | null> {
  const s = await verify<AdminSession>(cookies(req)[COOKIE], env.SESSION_SECRET);
  if (!s || s.exp < now || String(s.id) !== String(env.ADMIN_GITHUB_ID)) return null;
  return s;
}

function redirect(location: string, setCookie?: string[]): Response {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  for (const c of setCookie ?? []) headers.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers });
}

/** GitHub OAuth web flow. Only the GitHub id in ADMIN_GITHUB_ID gets a session; the GitHub token is thrown away. */
async function login(req: Request, env: Env): Promise<Response> {
  const state = randomToken(16);
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', env.ADMIN_OAUTH_CLIENT_ID);
  url.searchParams.set('state', state);
  url.searchParams.set('redirect_uri', new URL('/admin/callback', req.url).toString());
  url.searchParams.set('allow_signup', 'false');
  return redirect(url.toString(), [cookie(STATE_COOKIE, state, 600)]);
}

async function callback(req: Request, env: Env, deps: Deps): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state || state !== cookies(req)[STATE_COOKIE]) return error(400, 'Ungültige Anmeldung');

  const tokenRes = await deps.fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: env.ADMIN_OAUTH_CLIENT_ID, client_secret: env.ADMIN_OAUTH_CLIENT_SECRET, code }),
  });
  const token = ((await tokenRes.json()) as { access_token?: string }).access_token;
  if (!token) return error(401, 'Anmeldung fehlgeschlagen');
  const userRes = await deps.fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'GratisStatt-Admin' },
  });
  const user = (await userRes.json()) as { id?: number };
  if (!user.id || String(user.id) !== String(env.ADMIN_GITHUB_ID)) return error(403, 'Kein Zugang');

  const value = await sign({ id: user.id, exp: deps.now() + SESSION_HOURS * 3600_000 }, env.SESSION_SECRET);
  return redirect('/admin', [cookie(COOKIE, value, SESSION_HOURS * 3600), cookie(STATE_COOKIE, '', 0)]);
}

async function overview(env: Env, now: number) {
  const today = day(now);
  const one = async (sql: string, ...args: unknown[]) =>
    ((await env.DB.prepare(sql).bind(...args).first<{ n: number }>())?.n ?? 0) as number;
  const counts = await env.DB.prepare('SELECT status, count(*) AS n FROM submissions GROUP BY status').all<{ status: string; n: number }>();
  const recent = await env.DB.prepare(
    `SELECT s.repo_id, s.repo_name, s.submitted_day, s.status, s.reason, u.login
     FROM submissions s LEFT JOIN users u ON u.github_id = s.github_id
     ORDER BY s.submitted_day DESC, s.rowid DESC LIMIT 100`,
  ).all();
  const users = await env.DB.prepare(
    'SELECT github_id, login, app_version, joined_day, last_active_day, submissions, status FROM users ORDER BY last_active_day DESC LIMIT 5000',
  ).all();
  return {
    total: await one('SELECT count(*) AS n FROM users'),
    active7: await one('SELECT count(*) AS n FROM users WHERE last_active_day >= ?', addDays(today, -6)),
    active30: await one('SELECT count(*) AS n FROM users WHERE last_active_day >= ?', addDays(today, -29)),
    submissions: Object.fromEntries(counts.results.map((r) => [r.status, r.n])),
    recent: recent.results,
    users: users.results,
  };
}

/** New projects per week, read from the published update manifest. */
async function history(env: Env, deps: Deps) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.DATA_REPO ?? '')) return { weeks: [] };
  try {
    const res = await deps.fetch(`https://github.com/${env.DATA_REPO}/releases/latest/download/manifest.json`, { redirect: 'follow' });
    if (!res.ok) return { weeks: [] };
    const m = (await res.json()) as { deltas?: { date: string; count: number; added?: number }[] };
    return { weeks: (m.deltas ?? []).slice(-26).map((d) => ({ date: d.date, count: d.count, added: d.added ?? null })) };
  } catch {
    return { weeks: [] };
  }
}

export async function handleAdmin(req: Request, env: Env, deps: Deps): Promise<Response> {
  const { pathname } = new URL(req.url);
  const now = deps.now();
  if (pathname === '/admin/login') return login(req, env);
  if (pathname === '/admin/callback') return callback(req, env, deps);
  if (pathname === '/admin/logout') return redirect('/admin', [cookie(COOKIE, '', 0)]);

  const s = await session(req, env, now);
  if (pathname === '/admin' || pathname === '/admin/') return s ? html(DASHBOARD_HTML, PAGE_CSP) : html(LOGIN_HTML, PAGE_CSP);
  if (pathname === '/admin/app.js') {
    return new Response(DASHBOARD_JS, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' } });
  }

  if (!pathname.startsWith('/admin/api/')) return error(404, 'Nicht gefunden');
  if (!s) return error(401, 'Nicht angemeldet');
  // Changes need a custom header: cross-site forms can't send it (CSRF).
  if (req.method !== 'GET' && req.headers.get('X-Admin-Request') !== '1') return error(403, 'Nicht erlaubt');

  if (req.method === 'GET' && pathname === '/admin/api/overview') return json(await overview(env, now));
  if (req.method === 'GET' && pathname === '/admin/api/history') return json(await history(env, deps));

  if (req.method === 'GET' && pathname === '/admin/api/reviews') return json({ reviews: await adminReviewList(env) });
  const rv = pathname.match(/^\/admin\/api\/reviews\/(\d+)(?:\/(hide|show))?$/);
  if (rv) {
    if (req.method === 'POST' && rv[2]) {
      await adminReviewAction(env, Number(rv[1]), rv[2] as 'hide' | 'show');
      return json({ ok: true });
    }
    if (req.method === 'DELETE' && !rv[2]) {
      await adminReviewAction(env, Number(rv[1]), 'delete');
      return json({ ok: true });
    }
  }

  const m = pathname.match(/^\/admin\/api\/users\/(\d+)(?:\/(block|unblock))?$/);
  if (m) {
    const id = Number(m[1]);
    if (req.method === 'POST' && m[2]) {
      await env.DB.prepare('UPDATE users SET status = ? WHERE github_id = ?').bind(m[2] === 'block' ? 'blocked' : 'active', id).run();
      return json({ ok: true });
    }
    if (req.method === 'DELETE' && !m[2]) {
      await deleteUser(env, id);
      return json({ ok: true });
    }
  }
  return error(404, 'Nicht gefunden');
}
