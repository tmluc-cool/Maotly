import { handle } from '../src/index';
import type { Env } from '../src/types';
import { createD1 } from './d1-shim';

export const ADMIN_SECRET = 'a'.repeat(40);
const ORIGIN = 'https://gs.example.workers.dev';

export function setup(start = Date.parse('2026-10-12T10:00:00Z')) {
  const DB = createD1();
  const env: Env = {
    DB, ADMIN_SECRET, ADMIN_GITHUB_ID: '999', ADMIN_OAUTH_CLIENT_ID: 'cid', ADMIN_OAUTH_CLIENT_SECRET: 'csecret',
    SESSION_SECRET: 's'.repeat(40), DATA_REPO: 'o/moatly-data',
  };
  let now = start;
  const ghUsers: Record<string, { id: number; login: string }> = { gho_alice_000: { id: 1, login: 'alice' }, gho_bob_00000: { id: 2, login: 'bob' }, gho_admin_000: { id: 999, login: 'boss' } };
  const outbound: { url: string; init?: RequestInit }[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    outbound.push({ url, init });
    const auth = (init?.headers as Record<string, string>)?.Authorization?.replace('Bearer ', '');
    if (url === 'https://api.github.com/user') {
      const u = auth && ghUsers[auth];
      return u ? Response.json(u) : new Response('{}', { status: 401 });
    }
    const repoMatch = url.match(/^https:\/\/api\.github\.com\/repositories\/(\d+)$/);
    if (repoMatch) {
      const u = auth && ghUsers[auth];
      if (!u) return new Response('{}', { status: 401 });
      // Repo 500 belongs to bob; repo 600 belongs to an organisation where alice is admin.
      if (repoMatch[1] === '500') return Response.json({ owner: { id: 2 }, permissions: { admin: u.id === 2 } });
      if (repoMatch[1] === '600') return Response.json({ owner: { id: 77 }, permissions: { admin: u.id === 1 } });
      return new Response('{}', { status: 404 });
    }
    if (url === 'https://github.com/login/oauth/access_token') {
      const code = JSON.parse(String(init?.body)).code;
      return Response.json(code === 'good' ? { access_token: 'gho_admin_000' } : code === 'other' ? { access_token: 'gho_alice_000' } : {});
    }
    if (url.endsWith('/manifest.json')) return Response.json({ deltas: [{ date: '2026-10-05', count: 1200 }, { date: '2026-10-12', count: 900 }] });
    return new Response('nope', { status: 404 });
  }) as typeof fetch;
  const call = (method: string, path: string, opts: { body?: unknown; token?: string; headers?: Record<string, string> } = {}) =>
    handle(
      new Request(ORIGIN + path, {
        method,
        headers: {
          ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
          ...opts.headers,
        },
        body: opts.body === undefined ? undefined : typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body),
      }),
      env,
      { fetch: fetchFn, now: () => now },
    );
  const register = async (gh = 'gho_alice_000') => (await (await call('POST', '/v1/register', { body: { githubToken: gh } })).json()) as { sessionToken: string; login: string; joinedDay: string };
  return { env, DB, call, register, outbound, advanceDays: (d: number) => (now += d * 86_400_000), now: () => now };
}

