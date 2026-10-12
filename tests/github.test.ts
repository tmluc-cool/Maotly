import { describe, expect, it, vi } from 'vitest';
import { GitHubService } from '../src/main/github';
import type { RepoStats, Snapshot } from '../src/shared/types';

const NOW = Date.parse('2026-10-12T12:00:00Z');
const seed = (stars: number): RepoStats => ({
  stars, pushedAt: null, license: null, description: null, homepage: null, archived: false, topics: [], latestRelease: null,
});
const snapshot: Snapshot = { generatedAt: '2026-10-01T00:00:00Z', repos: { 'o/a': seed(1), 'o/b': seed(2) } };

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}
const limitHeaders = (remaining: number) => ({
  'x-ratelimit-limit': '60', 'x-ratelimit-remaining': String(remaining),
  'x-ratelimit-reset': String(Math.floor(NOW / 1000) + 600), 'x-ratelimit-resource': 'core',
});

function makeService(fetchImpl: (url: string) => Promise<Response>, cacheRaw: string | null = null) {
  let written: string | null = null;
  const service = new GitHubService({
    fetch: vi.fn((input: string | URL | Request) => fetchImpl(String(input))) as unknown as typeof fetch,
    snapshot,
    getToken: () => null,
    readCache: () => cacheRaw,
    writeCache: (d) => (written = d),
    now: () => NOW,
  });
  return { service, written: () => written };
}

describe('GitHubService', () => {
  it('fetches repo + latest release and writes the cache', async () => {
    const { service, written } = makeService(async (url) => {
      if (url.endsWith('/releases/latest')) {
        return json({ tag_name: 'v2', published_at: '2026-09-01T00:00:00Z', assets: [{ name: 'a-x64.exe', size: 5e6, browser_download_url: 'https://github.com/o/a/releases/download/v2/a-x64.exe' }] }, 200, limitHeaders(58));
      }
      return json({ full_name: 'o/a', stargazers_count: 1234, pushed_at: '2026-10-10T00:00:00Z', license: { spdx_id: 'MIT' }, archived: false, topics: ['x'] }, 200, limitHeaders(59));
    });
    const res = await service.refresh(['o/a']);
    expect(res.status.kind).toBe('ok');
    expect(res.repos['o/a'].stats.stars).toBe(1234);
    expect(res.repos['o/a'].stats.license).toBe('MIT');
    expect(res.repos['o/a'].stats.latestRelease?.assets[0].name).toBe('a-x64.exe');
    expect(res.repos['o/a'].source).toBe('live');
    expect(JSON.parse(written()!).repos['o/a'].stats.stars).toBe(1234);
    expect(service.getRateLimits().core.remaining).toBe(58);
  });

  it('treats a missing release as no release', async () => {
    const { service } = makeService(async (url) =>
      url.endsWith('/releases/latest') ? json({ message: 'Not Found' }, 404) : json({ stargazers_count: 3, pushed_at: '2026-10-10T00:00:00Z' }),
    );
    const res = await service.refresh(['o/a']);
    expect(res.repos['o/a'].stats.latestRelease).toBeNull();
  });

  it('does not refresh fresh cache entries', async () => {
    const cache = JSON.stringify({ version: 1, repos: { 'o/a': { stats: { ...seed(9), pushedAt: '2026-10-10T00:00:00Z' }, fetchedAt: new Date(NOW - 3600_000).toISOString() } } });
    const fetchSpy = vi.fn(async () => json({}));
    const { service } = makeService(fetchSpy, cache);
    const res = await service.refresh(['o/a']);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.repos['o/a'].stats.stars).toBe(9);
  });

  it('falls back silently when the rate limit is hit', async () => {
    const { service } = makeService(async () => json({ message: 'API rate limit exceeded' }, 403, limitHeaders(0)));
    const res = await service.refresh(['o/a', 'o/b']);
    expect(res.status.kind).toBe('ratelimited');
    expect(res.status.resetAt).toBeTruthy();
    expect(res.status.dataDate).toBe('2026-10-01T00:00:00.000Z');
    expect(res.repos['o/a'].stats.stars).toBe(1);

    // Next call: no request at all while the limit is exhausted.
    const second = await service.refresh(['o/b']);
    expect(second.status.kind).toBe('ratelimited');
  });

  it('reports offline when fetch throws', async () => {
    const { service } = makeService(async () => {
      throw new TypeError('fetch failed');
    });
    const res = await service.refresh(['o/a']);
    expect(res.status.kind).toBe('offline');
    expect(res.repos['o/a'].source).toBe('snapshot');
  });

  it('live search maps hits and handles the search limit', async () => {
    const { service } = makeService(async (url) => {
      expect(decodeURIComponent(url)).toContain('q=photoshop alternative in:name,description,readme');
      expect(url).toContain('per_page=10');
      return json({ items: [{ full_name: 'x/y', description: 'd', stargazers_count: 5, html_url: 'https://github.com/x/y' }] }, 200, { ...limitHeaders(9), 'x-ratelimit-resource': 'search' });
    });
    const res = await service.searchLive('photoshop');
    expect(res.ok && res.hits[0].repo).toBe('x/y');

    const limited = makeService(async () => json({}, 403, { ...limitHeaders(0), 'x-ratelimit-resource': 'search' }));
    const res2 = await limited.service.searchLive('photoshop');
    expect(res2.ok).toBe(false);
    expect(!res2.ok && res2.reason).toBe('ratelimited');
  });

  it('clearCache returns to snapshot data', async () => {
    const cache = JSON.stringify({ version: 1, repos: { 'o/a': { stats: seed(99), fetchedAt: '2026-10-11T00:00:00Z' } } });
    const { service, written } = makeService(async () => json({}), cache);
    expect(service.getState().repos['o/a'].stats.stars).toBe(99);
    const state = service.clearCache();
    expect(state.repos['o/a'].stats.stars).toBe(1);
    expect(JSON.parse(written()!).repos).toEqual({});
  });
});
