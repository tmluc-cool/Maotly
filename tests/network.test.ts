import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { config } from '../src/main/config';
import { AppDatabase } from '../src/main/database';
import { GitHubAccount } from '../src/main/github-account';
import { Network, type Secrets } from '../src/main/network';
import { toRepoRow } from '../src/shared/crawler';
import { setLang } from '../src/shared/i18n';
import { makeRepos } from './helpers/fake-github';

interface Call { url: string; method: string; body?: unknown; auth?: string | null }

function setup(opts: { serverDown?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gs-net-'));
  const { db } = AppDatabase.open(dir, join(dir, 'no-base.db'));
  const store = new Map<string, string>();
  const secrets: Secrets = { get: (n) => store.get(n) ?? null, set: (n, v) => void store.set(n, v), clear: (n) => void store.delete(n) };
  const calls: Call[] = [];
  let polls = 0;
  let now = Date.parse('2026-10-12T10:00:00Z');
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? null;
    calls.push({ url, method: init?.method ?? 'GET', body, auth });
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
    if (url === 'https://github.com/login/device/code') return json({ device_code: 'dc', user_code: 'ABCD-1234', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 });
    if (url === 'https://api.github.com/user') return json({ login: 'octo', id: 7 });
    if (url === 'https://github.com/login/oauth/access_token') return json(++polls < 3 ? { error: 'authorization_pending' } : { access_token: 'gho_token' });
    if (url.startsWith(config.serverUrl)) {
      if (opts.serverDown) throw new TypeError('fetch failed');
      if (url.endsWith('/v1/register')) return json({ sessionToken: 'sess', login: 'octo', joinedDay: '2026-10-12' });
      if (url.endsWith('/v1/me') && init?.method === 'DELETE') return json({ ok: true });
      if (url.endsWith('/v1/reviews') && init?.method === 'POST') return json({ id: 77, createdDay: '2026-10-12', updatedDay: '2026-10-12' });
      if (/\/v1\/reviews\/\d+\/vote$/.test(url)) return json({ ok: true });
      if (/\/v1\/reviews\/\d+\/reply$/.test(url) && init?.method === 'POST') {
        return body?.githubToken === 'gho_token' ? json({ ok: true, replyDay: '2026-10-12' }) : json({ error: 'Nur der Owner des Projekts kann antworten' }, 403);
      }
      if (url.endsWith('/v1/me')) return json({ login: 'octo', appVersion: '1.0.0', joinedDay: '2026-10-12', lastActiveDay: '2026-10-12', submissions: 3, status: 'active', pendingSubmissions: 1 });
      return json({ ok: true });
    }
    return json({}, 404);
  }) as typeof fetch;
  const account = new GitHubAccount({
    secrets: { get: (n) => store.get(n) ?? null, set: (n, v) => void store.set(n, v), clear: (n) => void store.delete(n) },
    store: db,
    fetch: fetchFn,
    clientId: () => 'Ov23test',
    now: () => now,
    sleep: (ms) => new Promise<void>((r) => setTimeout(() => { now += ms; r(); }, 1)),
  });
  const network = new Network({ db, secrets, account, fetch: fetchFn, appVersion: '1.0.0', available: () => true, now: () => now });
  return { db, network, account, calls, store, advance: (ms: number) => (now += ms), serverCalls: () => calls.filter((c) => c.url.startsWith(config.serverUrl)) };
}

describe('network (opt-in)', () => {
  it('does not ask or join while the network is not set up', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gs-net-'));
    const { db } = AppDatabase.open(dir, join(dir, 'no-base.db'));
    const calls: string[] = [];
    const store = new Map<string, string>();
    const secrets = { get: (k: string) => store.get(k) ?? null, set: (k: string, v: string) => void store.set(k, v), clear: (k: string) => void store.delete(k) };
    const account = new GitHubAccount({ secrets, store: db, fetch: (async () => new Response('{}')) as unknown as typeof fetch, clientId: () => null });
    const n = new Network({
      db,
      secrets,
      account,
      fetch: (async (u: string) => (calls.push(String(u)), new Response('{}'))) as unknown as typeof fetch,
      appVersion: '1',
      available: () => false,
    });
    expect(n.state()).toMatchObject({ available: false, askConsent: false });
    await n.join();
    expect(calls).toEqual([]);
  });

  it('asks on first start and sends nothing before joining', async () => {
    const s = setup();
    expect(s.network.state().askConsent).toBe(true);
    s.db.storeLive(makeRepos(3).map(toRepoRow));
    s.db.queueSubmissions([1, 2, 3]);
    await s.network.heartbeat();
    await s.network.flushSubmissions();
    expect(s.calls).toEqual([]);
  });

  it('"Nein danke" is stored with date and version and sends nothing', async () => {
    const s = setup();
    s.network.decline();
    expect(s.network.state()).toMatchObject({ consent: 'no', askConsent: false, member: null });
    expect(s.db.getMeta('consent_version')).toBe(String(config.consentVersion));
    expect(s.db.getMeta('consent_date')).toBeTruthy();
    await s.network.heartbeat();
    expect(s.calls).toEqual([]);
  });

  it('joins via device flow, registers and keeps tokens out of the database', async () => {
    const s = setup();
    await s.network.join();
    const st = s.network.state();
    expect(st.member).toEqual({ login: 'octo', joinedDay: '2026-10-12' });
    expect(st.askConsent).toBe(false);
    expect(s.store.get('session')).toBe('sess');
    expect(s.store.get('github')).toBe('gho_token');
    expect(s.account.state().login).toBe('octo');
    const reg = s.serverCalls().find((c) => c.url.endsWith('/v1/register'))!;
    expect(reg.body).toEqual({ githubToken: 'gho_token' });
    // Device code request asks for no scopes.
    expect(s.calls[0].body).toMatchObject({ scope: '' });
    expect(JSON.stringify(s.db.db.prepare('SELECT * FROM meta').all())).not.toContain('gho_token');
  });

  it('sends a heartbeat at most once a day and submissions at most once an hour', async () => {
    const s = setup();
    await s.network.join();
    const beats = () => s.serverCalls().filter((c) => c.url.endsWith('/heartbeat')).length;
    expect(beats()).toBe(1);
    await s.network.heartbeat();
    expect(beats()).toBe(1);
    s.advance(24 * 3600_000);
    await s.network.heartbeat();
    expect(beats()).toBe(2);
    expect(s.serverCalls().find((c) => c.url.endsWith('/heartbeat'))!.body).toEqual({ appVersion: '1.0.0' });

    s.db.storeLive(makeRepos(3).map(toRepoRow));
    s.db.queueSubmissions([1, 2, 3]);
    await s.network.flushSubmissions();
    const subs = s.serverCalls().filter((c) => c.url.endsWith('/submissions'));
    expect(subs.map((c) => c.body)).toEqual([{ repoIds: [1, 2, 3] }]);
    expect(subs[0].auth).toBe('Bearer sess');
    expect(s.db.pendingSubmissions()).toEqual([]);
    s.db.queueSubmissions([1]);
    s.db.storeLive(makeRepos(4).map(toRepoRow));
    s.db.queueSubmissions([4]);
    await s.network.flushSubmissions();
    expect(s.serverCalls().filter((c) => c.url.endsWith('/submissions')).length).toBe(1); // same hour
  });

  it('only queues finds that did not come from the base or a package', () => {
    const s = setup();
    const [a, b] = makeRepos(2).map(toRepoRow);
    s.db.db.prepare("INSERT INTO repos (id, full_name, name, owner, stars, html_url, first_seen_at, last_seen_at, source) VALUES (?, ?, ?, ?, 1, '', '', '', 'base')").run(a.id, a.full_name, a.name, a.owner);
    s.db.storeLive([a, b]);
    s.db.queueSubmissions([a.id, b.id]);
    expect(s.db.pendingSubmissions()).toEqual([b.id]);
  });

  it('cancelling the sign-in counts as "no"', async () => {
    const s = setup();
    const p = s.network.join();
    await new Promise((r) => setTimeout(r, 0));
    expect(s.network.state().signIn.state).toBe('waiting');
    s.network.cancelJoin();
    await p;
    expect(s.network.state()).toMatchObject({ consent: 'no', member: null, askConsent: false });
    expect(s.serverCalls()).toEqual([]);
  });

  it('leaving deletes the server data first, then everything locally', async () => {
    const s = setup();
    await s.network.join();
    s.db.storeLive(makeRepos(2).map(toRepoRow));
    s.db.queueSubmissions([1, 2]);
    const r = await s.network.leave();
    expect(r.ok).toBe(true);
    expect(s.serverCalls().some((c) => c.method === 'DELETE' && c.url.endsWith('/v1/me'))).toBe(true);
    // The server session is gone; the GitHub sign-in stays until the user signs out.
    expect([...s.store.keys()]).toEqual(['github']);
    expect(s.db.pendingSubmissions()).toEqual([]);
    expect(s.network.state()).toMatchObject({ consent: 'no', member: null });
  });

  it('keeps the membership if the server cannot delete the data', async () => {
    const s = setup();
    await s.network.join();
    // simulate the server going down
    const down = setup({ serverDown: true });
    await down.network.join().catch(() => {});
    down.store.set('session', 'sess');
    down.db.setMeta('network_consent', 'yes');
    const r = await down.network.leave();
    expect(r.ok).toBe(false);
    expect(down.store.get('session')).toBe('sess');
  });

  it('asks members again when the consent text changes, but not people who said no', async () => {
    const member = setup();
    await member.network.join();
    const no = setup();
    no.network.decline();
    const old = config.consentVersion;
    config.consentVersion = old + 1;
    try {
      expect(member.network.state().askConsent).toBe(true);
      expect(no.network.state().askConsent).toBe(false);
      await member.network.join(); // confirming does not need a new sign-in
      expect(member.network.state().askConsent).toBe(false);
    } finally {
      config.consentVersion = old;
    }
  });

  it('reviews: only members can write; own review, votes and answers show up locally at once', async () => {
    const s = setup();
    const repo = makeRepos(1).map(toRepoRow);
    s.db.storeLive(repo);
    expect(await s.network.writeReview(1, 5, 'Gut')).toMatchObject({ ok: false });
    expect(s.serverCalls()).toEqual([]);

    await s.network.join();
    expect(await s.network.writeReview(1, 4, '  Läuft gut  ')).toEqual({ ok: true });
    const post = s.serverCalls().find((c) => c.url.endsWith('/v1/reviews'))!;
    expect(post.body).toEqual({ repoId: 1, rating: 4, text: '  Läuft gut  ' });
    let d = s.db.repoDetails(1);
    expect(d.reviews[0]).toMatchObject({ id: 77, author: 'octo', rating: 4, text: 'Läuft gut', local: 1 });
    expect(d.summary.count).toBe(1);

    // Someone else's review arrives with the package; vote and answer as owner.
    s.db.db.prepare("INSERT INTO reviews (id, repo_id, author, rating, text, votes) VALUES (5, 1, 'bob', 2, 'Stürzt ab', 1)").run();
    expect(await s.network.vote(5, true)).toEqual({ ok: true });
    expect(await s.network.reply(5, 'Ist behoben')).toEqual({ ok: true });
    const reply = s.serverCalls().find((c) => c.url.endsWith('/v1/reviews/5/reply'))!;
    expect(reply.body).toEqual({ text: 'Ist behoben', githubToken: 'gho_token' });
    d = s.db.repoDetails(1);
    expect(d.reviews.find((r) => r.id === 5)).toMatchObject({ votes: 2, voted: true, reply_text: 'Ist behoben', reply_author: 'octo' });

    // Leaving removes all of it locally too.
    await s.network.leave();
    d = s.db.repoDetails(1);
    expect(d.reviews.map((r) => r.id)).toEqual([5]);
    expect(d.reviews[0]).toMatchObject({ votes: 1, voted: false, reply_text: null });
  });

  it('explains server refusals in the app language, not with the server text', async () => {
    const s = setup();
    await s.network.join();
    s.store.set('github', 'gho_someone_else');
    expect(await s.network.reply(5, 'Danke')).toEqual({ ok: false, message: 'Only the owner of the project can reply.' });
    setLang('de');
    try {
      expect(await s.network.reply(5, 'Danke')).toEqual({ ok: false, message: 'Nur der Owner des Projekts kann antworten.' });
    } finally {
      setLang('en');
    }
  });

  it('joining reuses an existing GitHub sign-in (no second code)', async () => {
    const s = setup();
    await s.account.signIn();
    expect(s.account.state()).toMatchObject({ available: true, login: 'octo', flow: { state: 'idle' } });
    const codes = () => s.calls.filter((c) => c.url.endsWith('/login/device/code')).length;
    expect(codes()).toBe(1);
    await s.network.join();
    expect(codes()).toBe(1);
    expect(s.network.state().member?.login).toBe('octo');
  });

  it('sign-in: refuses without safe storage, signs out on request', async () => {
    const s = setup();
    await s.account.signIn();
    s.account.signOut();
    expect(s.account.state()).toMatchObject({ login: null, flow: { state: 'idle' } });
    expect(s.store.has('github')).toBe(false);

    const noStore = new GitHubAccount({
      secrets: { get: () => null, set: () => undefined, clear: () => undefined },
      store: s.db,
      fetch: (async () => new Response('{}')) as unknown as typeof fetch,
      clientId: () => 'Ov23test',
      canStore: () => false,
    });
    await expect(noStore.signIn()).rejects.toThrow();
    expect(noStore.state().flow.state).toBe('error');
  });
});
