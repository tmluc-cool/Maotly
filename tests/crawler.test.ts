import { describe, expect, it } from 'vitest';
import {
  baseFilter, crawl, GitHubClient, initialCrawlState, newProjectsFilter, sliceQuery, splitSlice, type GitHubRepo,
} from '../src/shared/crawler';
import { fakeSearchFetch, makeRepos } from './helpers/fake-github';

const TODAY = '2026-10-12';
const noSleep = async () => {};

describe('slices', () => {
  const f = baseFilter(TODAY);
  it('builds queries', () => {
    expect(f.qualifiers).toContain('pushed:>=2024-10-12');
    expect(sliceQuery(f, { starsMin: 100, starsMax: null })).toBe('fork:false archived:false pushed:>=2024-10-12 stars:>=100');
    expect(sliceQuery(f, { starsMin: 100, starsMax: 199 })).toMatch(/stars:100\.\.199$/);
    expect(sliceQuery(f, { starsMin: 150, starsMax: 150, createdFrom: '2020-01-01', createdTo: '2020-06-30' })).toMatch(
      /stars:150 created:2020-01-01\.\.2020-06-30$/,
    );
    expect(sliceQuery(newProjectsFilter('2026-10-05'), { starsMin: 20, starsMax: null })).toBe('fork:false stars:>=20 created:>=2026-10-05');
  });

  it('halves open ranges by doubling, closed ranges in the middle', () => {
    expect(splitSlice({ starsMin: 100, starsMax: null }, f, TODAY)).toEqual([
      { starsMin: 100, starsMax: 199 },
      { starsMin: 200, starsMax: null },
    ]);
    expect(splitSlice({ starsMin: 100, starsMax: 199 }, f, TODAY)).toEqual([
      { starsMin: 100, starsMax: 149 },
      { starsMin: 150, starsMax: 199 },
    ]);
  });

  it('falls back to splitting the creation date, and gives up on a single day', () => {
    const [a, b] = splitSlice({ starsMin: 100, starsMax: 100 }, f, TODAY)!;
    expect(a.createdFrom).toBe('2007-10-01');
    expect(b.createdTo).toBe(TODAY);
    expect(a.createdTo! < b.createdFrom!).toBe(true);
    const nf = newProjectsFilter('2026-10-01');
    const [c] = splitSlice({ starsMin: 20, starsMax: 20 }, nf, TODAY)!;
    expect(c.createdFrom).toBe('2026-10-01');
    expect(splitSlice({ starsMin: 100, starsMax: 100, createdFrom: TODAY, createdTo: TODAY }, f, TODAY)).toBeNull();
  });
});

describe('crawl', () => {
  it('collects every repo although each query is capped at 1000', async () => {
    const repos = makeRepos(6000);
    // 2500 repos with exactly 100 stars force a split by creation date.
    repos.slice(0, 2500).forEach((r) => (r.stargazers_count = 100));
    const calls: string[] = [];
    const client = new GitHubClient({ fetch: fakeSearchFetch(repos, calls), sleep: noSleep });
    const seen = new Map<number, GitHubRepo>();
    const state = initialCrawlState(baseFilter(TODAY));
    const result = await crawl({ client, filter: baseFilter(TODAY), state, today: TODAY, onRepos: (r) => r.forEach((x) => seen.set(x.id, x)) });
    expect(result).toBe('done');
    expect(seen.size).toBe(6000);
    expect(state.queue).toEqual([]);
    expect(state.truncated).toBe(0);
    expect(calls.some((q) => q.includes('created:'))).toBe(true); // many repos with exactly 100 stars
  });

  it('resumes exactly where it stopped', async () => {
    const repos = makeRepos(3000, 7);
    const filter = baseFilter(TODAY);
    const seen = new Set<number>();
    let saved = '';
    let slices = 0;
    const run = async (stopAfter: number) => {
      const state = saved ? JSON.parse(saved) : initialCrawlState(filter);
      const calls: string[] = [];
      const client = new GitHubClient({ fetch: fakeSearchFetch(repos, calls), sleep: noSleep });
      const res = await crawl({
        client, filter, state, today: TODAY,
        onRepos: (r) => r.forEach((x) => seen.add(x.id)),
        onState: (s) => { saved = JSON.stringify(s); slices++; },
        shouldStop: () => slices >= stopAfter,
      });
      return { res, calls };
    };
    const first = await run(3);
    expect(first.res).toBe('stopped');
    const done = JSON.parse(saved).slicesDone;
    const second = await run(Infinity);
    expect(second.res).toBe('done');
    expect(seen.size).toBe(3000);
    expect(JSON.parse(saved).slicesDone).toBeGreaterThan(done);
    // The second run must not start again with the root query.
    expect(second.calls[0]).not.toBe(first.calls[0]);
  });
});

describe('GitHubClient rate limits', () => {
  function scripted(responses: Response[]) {
    const waits: number[] = [];
    let now = 1_000_000;
    let i = 0;
    const client = new GitHubClient({
      fetch: (async () => responses[i++]) as unknown as typeof fetch,
      sleep: async (ms) => { waits.push(ms); now += ms; },
      now: () => now,
      token: 'x',
    });
    return { client, waits, count: () => i };
  }
  const ok = () => new Response(JSON.stringify({ total_count: 0, incomplete_results: false, items: [] }), { status: 200 });

  it('waits for retry-after on 403/429', async () => {
    const s = scripted([new Response('{}', { status: 429, headers: { 'retry-after': '30' } }), ok()]);
    await s.client.searchRepos('x');
    expect(s.count()).toBe(2);
    expect(s.waits.some((w) => w >= 30_000)).toBe(true);
  });

  it('waits until x-ratelimit-reset when the limit is used up', async () => {
    const reset = Math.floor(1_000_000 / 1000) + 120; // 2 min later
    const s = scripted([
      new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) } }),
      ok(),
    ]);
    await s.client.searchRepos('x');
    expect(s.waits.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(120_000);
  });

  it('spaces search requests (30 per minute with token)', async () => {
    const s = scripted([ok(), ok(), ok()]);
    await s.client.searchRepos('a');
    await s.client.searchRepos('b');
    await s.client.searchRepos('c');
    expect(s.waits.filter((w) => w >= 2000).length).toBe(2);
  });

  it('backs off on secondary limits without hints and gives up eventually', async () => {
    const s = scripted(Array.from({ length: 10 }, () => new Response('{}', { status: 403 })));
    await expect(s.client.searchRepos('x')).rejects.toThrow(/rate limit/);
    expect(s.waits.every((w) => w >= 2000)).toBe(true);
  });
});
