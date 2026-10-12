import { describe, expect, it } from 'vitest';
import { cleanupInactive } from '../src/api';
import { MAX_REVIEWS_PER_DAY } from '../src/reviews';
import { sign } from '../src/util';
import { ADMIN_SECRET, setup } from './setup';

const ALICE = 'gho_alice_000';
const BOB = 'gho_bob_00000';

async function members() {
  const s = setup();
  const alice = (await s.register(ALICE)).sessionToken;
  const bob = (await s.register(BOB)).sessionToken;
  const review = async (token: string, repoId: number, rating = 5, text = 'Super Programm, läuft bei mir gut.') =>
    s.call('POST', '/v1/reviews', { token, body: { repoId, rating, text } });
  const exported = async () =>
    ((await (await s.call('GET', '/v1/admin/reviews', { token: ADMIN_SECRET })).json()) as { reviews: Record<string, unknown>[] }).reviews;
  return { s, alice, bob, review, exported };
}

describe('reviews', () => {
  it('needs a session to write', async () => {
    const s = setup();
    expect((await s.call('POST', '/v1/reviews', { body: { repoId: 1, rating: 5, text: 'Gut so' } })).status).toBe(401);
  });

  it('stores one review per member and project, editing replaces it', async () => {
    const m = await members();
    const first = (await (await m.review(m.alice, 500, 2, 'Stürzt beim Start ab.')).json()) as { id: number };
    expect(first.id).toBeGreaterThan(0);
    m.s.advanceDays(2);
    const second = (await (await m.review(m.alice, 500, 4, 'Mit der neuen Version läuft es.')).json()) as { id: number };
    expect(second.id).toBe(first.id);
    const all = await m.exported();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ repo_id: 500, author: 'alice', rating: 4, text: 'Mit der neuen Version läuft es.', created_day: '2026-10-12', updated_day: '2026-10-14', votes: 0 });
  });

  it('validates stars and text', async () => {
    const m = await members();
    for (const body of [
      { repoId: 500, rating: 0, text: 'Gut so' },
      { repoId: 500, rating: 6, text: 'Gut so' },
      { repoId: 500, rating: 3.5, text: 'Gut so' },
      { repoId: 500, rating: 3, text: '  ' },
      { repoId: 500, rating: 3, text: 'x'.repeat(501) },
      { repoId: 500, rating: 3, text: 'Steuer\u0007zeichen' },
      { repoId: -1, rating: 3, text: 'Gut so' },
    ]) {
      expect((await m.s.call('POST', '/v1/reviews', { token: m.alice, body })).status, JSON.stringify(body)).toBe(400);
    }
    expect((await m.review(m.alice, 500, 3, '  Zeile eins\r\nZeile zwei  ')).status).toBe(200);
    expect((await m.exported())[0].text).toBe('Zeile eins\nZeile zwei');
  });

  it('limits reviews per day', async () => {
    const m = await members();
    for (let i = 0; i < MAX_REVIEWS_PER_DAY; i++) expect((await m.review(m.alice, 1000 + i)).status).toBe(200);
    expect((await m.review(m.alice, 9999)).status).toBe(429);
  });

  it('upvotes: one per member, not on the own review, can be taken back', async () => {
    const m = await members();
    const { id } = (await (await m.review(m.alice, 500)).json()) as { id: number };
    expect((await m.s.call('POST', `/v1/reviews/${id}/vote`, { token: m.alice })).status).toBe(400);
    expect((await m.s.call('POST', `/v1/reviews/${id}/vote`, { token: m.bob })).status).toBe(200);
    expect((await m.s.call('POST', `/v1/reviews/${id}/vote`, { token: m.bob })).status).toBe(200); // twice = once
    expect((await m.exported())[0].votes).toBe(1);
    expect((await m.s.call('DELETE', `/v1/reviews/${id}/vote`, { token: m.bob })).status).toBe(200);
    expect((await m.exported())[0].votes).toBe(0);
    expect((await m.s.call('POST', '/v1/reviews/99999/vote', { token: m.bob })).status).toBe(404);
    // Who voted is never exported.
    expect(JSON.stringify(await m.exported())).not.toContain('bob');
  });

  it('only the project owner may answer – checked at GitHub with the member token', async () => {
    const m = await members();
    const { id } = (await (await m.review(m.alice, 500)).json()) as { id: number };
    // alice is not the owner of repo 500
    const no = await m.s.call('POST', `/v1/reviews/${id}/reply`, { token: m.alice, body: { text: 'Danke!', githubToken: ALICE } });
    expect(no.status).toBe(403);
    // bob owns repo 500, but must use his own GitHub token
    const wrongToken = await m.s.call('POST', `/v1/reviews/${id}/reply`, { token: m.bob, body: { text: 'Danke!', githubToken: ALICE } });
    expect(wrongToken.status).toBe(401);
    const ok = await m.s.call('POST', `/v1/reviews/${id}/reply`, { token: m.bob, body: { text: 'Danke, ist behoben!', githubToken: BOB } });
    expect(ok.status).toBe(200);
    expect((await m.exported())[0]).toMatchObject({ reply_text: 'Danke, ist behoben!', reply_author: 'bob', reply_day: '2026-10-12' });
    // The GitHub token is not stored anywhere.
    expect(JSON.stringify(m.s.DB.raw.prepare('SELECT * FROM reviews').all())).not.toContain(BOB);
    // The owner can remove the answer again, nobody else can.
    await m.s.call('DELETE', `/v1/reviews/${id}/reply`, { token: m.alice });
    expect((await m.exported())[0].reply_text).toBe('Danke, ist behoben!');
    await m.s.call('DELETE', `/v1/reviews/${id}/reply`, { token: m.bob });
    expect((await m.exported())[0].reply_text).toBeNull();
  });

  it('organisation repos: admins of the repo count as owner', async () => {
    const m = await members();
    const { id } = (await (await m.review(m.bob, 600)).json()) as { id: number };
    const ok = await m.s.call('POST', `/v1/reviews/${id}/reply`, { token: m.alice, body: { text: 'Wir schauen es an.', githubToken: ALICE } });
    expect(ok.status).toBe(200);
  });

  it('deleting the own review removes it and its votes', async () => {
    const m = await members();
    const { id } = (await (await m.review(m.alice, 500)).json()) as { id: number };
    await m.s.call('POST', `/v1/reviews/${id}/vote`, { token: m.bob });
    expect((await m.s.call('DELETE', '/v1/reviews/repo/500', { token: m.alice })).status).toBe(200);
    expect(await m.exported()).toEqual([]);
    expect(m.s.DB.raw.prepare('SELECT count(*) FROM review_votes').pluck().get()).toBe(0);
  });

  it('leaving the network removes reviews, votes and answers; /me counts them', async () => {
    const m = await members();
    const a = (await (await m.review(m.alice, 500)).json()) as { id: number };
    const b = (await (await m.review(m.bob, 600)).json()) as { id: number };
    await m.s.call('POST', `/v1/reviews/${b.id}/vote`, { token: m.alice });
    await m.s.call('POST', `/v1/reviews/${a.id}/vote`, { token: m.bob });
    await m.s.call('POST', `/v1/reviews/${b.id}/reply`, { token: m.alice, body: { text: 'Antwort', githubToken: ALICE } });
    expect(await (await m.s.call('GET', '/v1/me', { token: m.alice })).json()).toMatchObject({ reviews: 1, votes: 1 });

    expect((await m.s.call('DELETE', '/v1/me', { token: m.alice })).status).toBe(200);
    const left = await m.exported();
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ id: b.id, author: 'bob', votes: 0, reply_text: null });
    expect(m.s.DB.raw.prepare('SELECT count(*) FROM review_votes').pluck().get()).toBe(0);
  });

  it('the inactivity cron also removes reviews', async () => {
    const m = await members();
    await m.review(m.alice, 500);
    m.s.DB.raw.prepare("UPDATE users SET last_active_day = '2025-01-01' WHERE login = 'alice'").run();
    await cleanupInactive(m.s.env, m.s.now());
    expect(await m.exported()).toEqual([]);
  });

  it('blocked members: nothing stored, existing reviews not exported', async () => {
    const m = await members();
    await m.review(m.alice, 500);
    m.s.DB.raw.prepare("UPDATE users SET status = 'blocked' WHERE login = 'alice'").run();
    expect(await m.exported()).toEqual([]);
    expect((await (await m.review(m.alice, 501)).json()) as object).toEqual({ id: null });
    expect(m.s.DB.raw.prepare('SELECT count(*) FROM reviews').pluck().get()).toBe(1);
  });

  it('admin can hide, show and delete reviews; hidden ones are not exported', async () => {
    const m = await members();
    const { id } = (await (await m.review(m.alice, 500)).json()) as { id: number };
    const cookie = { Cookie: `gs_admin=${await sign({ id: 999, exp: m.s.now() + 1e6 }, 's'.repeat(40))}`, 'X-Admin-Request': '1' };
    expect((await m.s.call('POST', `/admin/api/reviews/${id}/hide`, { headers: cookie })).status).toBe(200);
    expect(await m.exported()).toEqual([]);
    const list = (await (await m.s.call('GET', '/admin/api/reviews', { headers: cookie })).json()) as { reviews: { status: string }[] };
    expect(list.reviews[0].status).toBe('hidden');
    // Editing does not unhide.
    await m.review(m.alice, 500, 1, 'Neuer Text');
    expect(await m.exported()).toEqual([]);
    await m.s.call('POST', `/admin/api/reviews/${id}/show`, { headers: cookie });
    expect(await m.exported()).toHaveLength(1);
    await m.s.call('DELETE', `/admin/api/reviews/${id}`, { headers: cookie });
    expect(await m.exported()).toEqual([]);
  });

  it('the export needs the admin secret', async () => {
    const s = setup();
    expect((await s.call('GET', '/v1/admin/reviews')).status).toBe(401);
  });
});
