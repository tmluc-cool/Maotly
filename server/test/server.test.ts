import { describe, expect, it } from 'vitest';
import { cleanupInactive, MAX_PER_DAY } from '../src/api';
import { sign } from '../src/util';
import { ADMIN_SECRET, setup } from './setup';

describe('register', () => {
  it('checks the GitHub token once and stores only id, login, days and a session hash', async () => {
    const s = setup();
    const r = await s.register();
    expect(r).toMatchObject({ login: 'alice', joinedDay: '2026-10-12' });
    expect(r.sessionToken.length).toBeGreaterThan(30);
    const row = s.DB.raw.prepare('SELECT * FROM users').get() as Record<string, unknown>;
    expect(row).toMatchObject({ github_id: 1, login: 'alice', joined_day: '2026-10-12', last_active_day: '2026-10-12', submissions: 0, status: 'active' });
    expect(JSON.stringify(row)).not.toContain('gho_alice_000');
    expect(JSON.stringify(row)).not.toContain(r.sessionToken);
    expect(row.session_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects invalid tokens and bad input', async () => {
    const s = setup();
    expect((await s.call('POST', '/v1/register', { body: { githubToken: 'gho_unknown_0' } })).status).toBe(401);
    expect((await s.call('POST', '/v1/register', { body: { githubToken: 'x' } })).status).toBe(400);
    expect((await s.call('POST', '/v1/register', { body: '{nope' })).status).toBe(400);
    expect((await s.call('POST', '/v1/register', { body: { githubToken: "abc'; DROP TABLE users;--" } })).status).toBe(400);
  });

  it('keeps the join day and a block when registering again', async () => {
    const s = setup();
    await s.register();
    s.DB.raw.prepare("UPDATE users SET status = 'blocked'").run();
    s.advanceDays(3);
    const r = await s.register();
    expect(r.joinedDay).toBe('2026-10-12');
    expect(s.DB.raw.prepare('SELECT status FROM users').pluck().get()).toBe('blocked');
  });
});

describe('member endpoints', () => {
  it('requires a valid session', async () => {
    const s = setup();
    expect((await s.call('GET', '/v1/me')).status).toBe(401);
    expect((await s.call('GET', '/v1/me', { token: 'wrong' })).status).toBe(401);
  });

  it('heartbeat sets app version and last active day (date only)', async () => {
    const s = setup();
    const { sessionToken } = await s.register();
    s.advanceDays(5);
    expect((await s.call('POST', '/v1/heartbeat', { token: sessionToken, body: { appVersion: '1.2.0' } })).status).toBe(200);
    expect(s.DB.raw.prepare('SELECT app_version, last_active_day FROM users').get()).toEqual({ app_version: '1.2.0', last_active_day: '2026-10-17' });
    expect((await s.call('POST', '/v1/heartbeat', { token: sessionToken, body: { appVersion: '<script>' } })).status).toBe(400);
  });

  it('accepts at most 50 ids per request and 200 per day, numbers only', async () => {
    const s = setup();
    const { sessionToken: t } = await s.register();
    const ids = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i);
    expect((await s.call('POST', '/v1/submissions', { token: t, body: { repoIds: ids(1, 51) } })).status).toBe(400);
    expect((await s.call('POST', '/v1/submissions', { token: t, body: { repoIds: ['1'] } })).status).toBe(400);
    expect((await s.call('POST', '/v1/submissions', { token: t, body: { repoIds: [-1] } })).status).toBe(400);
    for (let i = 0; i < 4; i++) {
      const r = await s.call('POST', '/v1/submissions', { token: t, body: { repoIds: ids(1 + i * 50, 50) } });
      expect(await r.json()).toEqual({ accepted: 50 });
    }
    expect((await s.call('POST', '/v1/submissions', { token: t, body: { repoIds: [9999] } })).status).toBe(429);
    expect(s.DB.raw.prepare('SELECT submissions FROM users').pluck().get()).toBe(MAX_PER_DAY);
    s.advanceDays(1);
    expect((await s.call('POST', '/v1/submissions', { token: t, body: { repoIds: [9999, 9999, 1] } })).status).toBe(200);
  });

  it('ignores submissions of blocked users', async () => {
    const s = setup();
    const { sessionToken: t } = await s.register();
    s.DB.raw.prepare("UPDATE users SET status = 'blocked'").run();
    expect(await (await s.call('POST', '/v1/submissions', { token: t, body: { repoIds: [1, 2] } })).json()).toEqual({ accepted: 0 });
    expect(s.DB.raw.prepare('SELECT count(*) FROM submissions').pluck().get()).toBe(0);
  });

  it('GET /me shows exactly the stored data, DELETE /me removes user and open submissions', async () => {
    const s = setup();
    const { sessionToken: t } = await s.register();
    await s.call('POST', '/v1/submissions', { token: t, body: { repoIds: [10, 11] } });
    s.DB.raw.prepare("UPDATE submissions SET status = 'accepted' WHERE repo_id = 10").run();
    expect(await (await s.call('GET', '/v1/me', { token: t })).json()).toEqual({
      login: 'alice', appVersion: null, joinedDay: '2026-10-12', lastActiveDay: '2026-10-12', submissions: 2, status: 'active', pendingSubmissions: 1,
      reviews: 0, votes: 0,
    });
    expect((await s.call('DELETE', '/v1/me', { token: t })).status).toBe(200);
    expect(s.DB.raw.prepare('SELECT count(*) FROM users').pluck().get()).toBe(0);
    expect(s.DB.raw.prepare('SELECT repo_id FROM submissions').pluck().all()).toEqual([10]);
    expect((await s.call('GET', '/v1/me', { token: t })).status).toBe(401);
  });

  it('never reads the client IP', async () => {
    const s = setup();
    await s.register();
    const dump = JSON.stringify(s.DB.raw.prepare('SELECT * FROM users').all());
    expect(dump).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
  });
});

describe('admin API for the weekly check', () => {
  it('needs the admin secret', async () => {
    const s = setup();
    expect((await s.call('GET', '/v1/admin/submissions?status=pending')).status).toBe(401);
    expect((await s.call('GET', '/v1/admin/submissions?status=pending', { token: 'b'.repeat(40) })).status).toBe(401);
  });

  it('lists pending repo ids of active users and stores the results', async () => {
    const s = setup();
    const a = await s.register('gho_alice_000');
    const b = await s.register('gho_bob_00000');
    await s.call('POST', '/v1/submissions', { token: a.sessionToken, body: { repoIds: [5, 6] } });
    await s.call('POST', '/v1/submissions', { token: b.sessionToken, body: { repoIds: [6, 7] } });
    s.DB.raw.prepare("UPDATE users SET status = 'blocked' WHERE login = 'bob'").run();
    const list = await (await s.call('GET', '/v1/admin/submissions?status=pending', { token: ADMIN_SECRET })).json();
    expect(list).toEqual({ repoIds: [5, 6] });
    const res = await s.call('POST', '/v1/admin/submissions/result', {
      token: ADMIN_SECRET,
      body: { results: [{ repoId: 5, status: 'accepted', repoName: 'o/five' }, { repoId: 6, status: 'rejected', reason: 'Fork' }] },
    });
    expect(res.status).toBe(200);
    expect(s.DB.raw.prepare('SELECT repo_id, status, reason, repo_name FROM submissions ORDER BY repo_id, github_id').all()).toEqual([
      { repo_id: 5, status: 'accepted', reason: null, repo_name: 'o/five' },
      { repo_id: 6, status: 'rejected', reason: 'Fork', repo_name: null },
      { repo_id: 6, status: 'rejected', reason: 'Fork', repo_name: null },
      { repo_id: 7, status: 'pending', reason: null, repo_name: null },
    ]);
  });
});

describe('cron', () => {
  it('deletes members inactive for 12 months', async () => {
    const s = setup();
    await s.register('gho_alice_000');
    s.advanceDays(200);
    await s.register('gho_bob_00000');
    s.advanceDays(200);
    expect(await cleanupInactive(s.env, s.now())).toBe(1);
    expect(s.DB.raw.prepare('SELECT login FROM users').pluck().all()).toEqual(['bob']);
  });
});

describe('admin dashboard', () => {
  it('shows a login page and redirects to GitHub with a state cookie', async () => {
    const s = setup();
    const page = await s.call('GET', '/admin');
    expect(await page.text()).toContain('Mit GitHub anmelden');
    expect(page.headers.get('Content-Security-Policy')).toContain("script-src 'self'");
    const r = await s.call('GET', '/admin/login');
    expect(r.status).toBe(302);
    expect(r.headers.get('Location')).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?client_id=cid&state=/);
    expect(r.headers.get('Set-Cookie')).toMatch(/gs_state=.*HttpOnly; Secure/);
  });

  it('lets only ADMIN_GITHUB_ID in', async () => {
    const s = setup();
    const login = await s.call('GET', '/admin/login');
    const state = new URL(login.headers.get('Location')!).searchParams.get('state');
    const cookie = `gs_state=${state}`;
    expect((await s.call('GET', `/admin/callback?code=good&state=wrong`, { headers: { Cookie: cookie } })).status).toBe(400);
    expect((await s.call('GET', `/admin/callback?code=other&state=${state}`, { headers: { Cookie: cookie } })).status).toBe(403);
    const ok = await s.call('GET', `/admin/callback?code=good&state=${state}`, { headers: { Cookie: cookie } });
    expect(ok.status).toBe(302);
    const session = ok.headers.get('Set-Cookie')!.match(/gs_admin=([^;]+)/)![1];
    expect(await (await s.call('GET', '/admin', { headers: { Cookie: `gs_admin=${session}` } })).text()).toContain('Mitglieder');
  });

  it('serves overview, history and user actions only with a valid session and the CSRF header', async () => {
    const s = setup();
    await s.register('gho_alice_000');
    const a = await s.register('gho_bob_00000');
    await s.call('POST', '/v1/submissions', { token: a.sessionToken, body: { repoIds: [1] } });
    expect((await s.call('GET', '/admin/api/overview')).status).toBe(401);
    const forged = await sign({ id: 1, exp: s.now() + 1e6 }, 's'.repeat(40));
    expect((await s.call('GET', '/admin/api/overview', { headers: { Cookie: `gs_admin=${forged}` } })).status).toBe(401);
    const expired = await sign({ id: 999, exp: s.now() - 1 }, 's'.repeat(40));
    expect((await s.call('GET', '/admin/api/overview', { headers: { Cookie: `gs_admin=${expired}` } })).status).toBe(401);

    const cookie = { Cookie: `gs_admin=${await sign({ id: 999, exp: s.now() + 1e6 }, 's'.repeat(40))}` };
    const o = (await (await s.call('GET', '/admin/api/overview', { headers: cookie })).json()) as Record<string, unknown>;
    expect(o).toMatchObject({ total: 2, active7: 2, active30: 2, submissions: { pending: 1 } });
    expect(JSON.stringify(o)).not.toContain('session_hash');
    expect(await (await s.call('GET', '/admin/api/history', { headers: cookie })).json()).toEqual({
      weeks: [{ date: '2026-10-05', count: 1200, added: null }, { date: '2026-10-12', count: 900, added: null }],
    });

    expect((await s.call('POST', '/admin/api/users/2/block', { headers: cookie })).status).toBe(403); // no CSRF header
    expect((await s.call('POST', '/admin/api/users/2/block', { headers: { ...cookie, 'X-Admin-Request': '1' } })).status).toBe(200);
    expect(s.DB.raw.prepare('SELECT status FROM users WHERE github_id = 2').pluck().get()).toBe('blocked');
    expect((await s.call('DELETE', '/admin/api/users/2', { headers: { ...cookie, 'X-Admin-Request': '1' } })).status).toBe(200);
    expect(s.DB.raw.prepare('SELECT count(*) FROM users').pluck().get()).toBe(1);
  });
});
