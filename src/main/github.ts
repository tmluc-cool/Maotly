import {
  emptyCache,
  mergeStats,
  newestDataDate,
  oldestDataDate,
  parseCache,
  reposNeedingRefresh,
  type CacheFile,
} from '../shared/cache';
import type {
  DataStatus,
  LiveSearchResult,
  RateLimitInfo,
  RefreshAllResult,
  RefreshResult,
  RepoEntry,
  RepoStats,
  SearchHit,
  Snapshot,
  StatsState,
} from '../shared/types';

const API = 'https://api.github.com';
const CONCURRENCY = 5;

export class OfflineError extends Error {}
export class RateLimitError extends Error {
  constructor(public resetAt: string | null) {
    super('GitHub rate limit reached');
  }
}
export class HttpError extends Error {
  constructor(public status: number) {
    super(`GitHub answered ${status}`);
  }
}

export interface GitHubServiceDeps {
  fetch: typeof fetch;
  snapshot: Snapshot;
  getToken: () => string | null;
  readCache: () => string | null;
  writeCache: (data: string) => void;
  now?: () => number;
  userAgent?: string;
}

interface ApiResponse {
  status: number;
  json: unknown;
}

function emptyLimit(): RateLimitInfo {
  return { limit: null, remaining: null, resetAt: null };
}

/** Builds RepoStats from the GitHub /repos and /releases/latest answers. */
export function toRepoStats(repo: Record<string, any>, release: Record<string, any> | null): RepoStats {
  return {
    stars: Number(repo.stargazers_count ?? 0),
    pushedAt: repo.pushed_at ?? null,
    license: repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION' ? repo.license.spdx_id : (repo.license?.name ?? null),
    description: repo.description ?? null,
    homepage: repo.homepage || null,
    archived: Boolean(repo.archived),
    topics: Array.isArray(repo.topics) ? repo.topics : [],
    latestRelease: release
      ? {
          tag: String(release.tag_name ?? ''),
          date: release.published_at ?? release.created_at ?? null,
          assets: Array.isArray(release.assets)
            ? release.assets.map((a: Record<string, any>) => ({
                name: String(a.name),
                size: Number(a.size ?? 0),
                url: String(a.browser_download_url),
              }))
            : [],
        }
      : null,
  };
}

/** Runs tasks with limited parallelism. Stops starting new tasks once `shouldStop` is true. */
export async function runPool<T>(items: T[], limit: number, task: (item: T) => Promise<void>, shouldStop: () => boolean) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length && !shouldStop()) {
      const item = items[index++];
      await task(item);
    }
  });
  await Promise.all(workers);
}

export class GitHubService {
  private cache: CacheFile;
  private entries: Record<string, RepoEntry>;
  private core: RateLimitInfo = emptyLimit();
  private search: RateLimitInfo = emptyLimit();
  private readonly now: () => number;

  constructor(private deps: GitHubServiceDeps) {
    this.now = deps.now ?? Date.now;
    this.cache = parseCache(safeRead(deps.readCache));
    this.entries = mergeStats(deps.snapshot, this.cache);
  }

  getState(): StatsState {
    return {
      repos: this.entries,
      snapshotDate: this.deps.snapshot.generatedAt,
      newestFetch: newestDataDate(this.entries),
    };
  }

  getRateLimits() {
    return { core: { ...this.core }, search: { ...this.search } };
  }

  clearCache(): StatsState {
    this.cache = emptyCache();
    this.persist();
    this.entries = mergeStats(this.deps.snapshot, this.cache);
    return this.getState();
  }

  /** Refreshes the given repos if their data is older than 24 hours (or always with force). */
  async refresh(repos: string[], force = false): Promise<RefreshResult> {
    const wanted = [...new Set(repos)];
    const todo = force ? wanted : reposNeedingRefresh(wanted, this.entries, this.now());
    const status = await this.fetchMany(todo);
    const subset: Record<string, RepoEntry> = {};
    for (const r of wanted) if (this.entries[r]) subset[r] = this.entries[r];
    return { repos: subset, status: { ...status, dataDate: oldestDataDate(wanted, this.entries) } };
  }

  async refreshAll(): Promise<RefreshAllResult> {
    const all = Object.keys(this.deps.snapshot.repos);
    const before = new Map(all.map((r) => [r, this.entries[r]?.fetchedAt]));
    const status = await this.fetchMany(all);
    let updated = 0;
    for (const r of all) if (this.entries[r]?.fetchedAt !== before.get(r)) updated++;
    return {
      updated,
      failed: all.length - updated,
      status: { ...status, dataDate: oldestDataDate(all, this.entries) },
    };
  }

  async searchLive(term: string): Promise<LiveSearchResult> {
    const clean = term.replace(/[:"\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!clean) return { ok: true, hits: [] };
    if (this.isExhausted(this.search)) {
      return { ok: false, reason: 'ratelimited', resetAt: this.search.resetAt };
    }
    const q = `${clean} alternative in:name,description,readme`;
    const path = `/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=10`;
    try {
      const res = await this.request(path);
      if (res.status !== 200) return { ok: false, reason: 'error', message: `GitHub antwortete mit ${res.status}` };
      const items = ((res.json as { items?: Record<string, any>[] }).items ?? []).slice(0, 10);
      const hits: SearchHit[] = items.map((i) => ({
        repo: String(i.full_name),
        description: i.description ?? null,
        stars: Number(i.stargazers_count ?? 0),
        pushedAt: i.pushed_at ?? null,
        license: i.license?.spdx_id && i.license.spdx_id !== 'NOASSERTION' ? i.license.spdx_id : null,
        archived: Boolean(i.archived),
        url: String(i.html_url),
      }));
      return { ok: true, hits };
    } catch (err) {
      if (err instanceof RateLimitError) return { ok: false, reason: 'ratelimited', resetAt: err.resetAt };
      if (err instanceof OfflineError) return { ok: false, reason: 'offline' };
      return { ok: false, reason: 'error', message: (err as Error).message };
    }
  }

  /** Checks a token against /rate_limit (which does not count against the limit). */
  async checkToken(token: string): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      const res = await this.request('/rate_limit', token);
      if (res.status === 200) return { ok: true };
      if (res.status === 401) return { ok: false, message: 'Der Token ist ungültig oder abgelaufen.' };
      return { ok: false, message: `GitHub antwortete mit ${res.status}.` };
    } catch (err) {
      if (err instanceof OfflineError) return { ok: false, message: 'Keine Internetverbindung. Bitte später nochmals versuchen.' };
      return { ok: false, message: (err as Error).message };
    }
  }

  /** Updates the displayed limits. Errors are ignored (e.g. offline). */
  async updateRateLimits(): Promise<void> {
    try {
      const res = await this.request('/rate_limit');
      const resources = (res.json as { resources?: Record<string, any> })?.resources;
      if (res.status === 200 && resources) {
        const toInfo = (r: any): RateLimitInfo =>
          r ? { limit: r.limit, remaining: r.remaining, resetAt: new Date(r.reset * 1000).toISOString() } : emptyLimit();
        this.core = toInfo(resources.core);
        this.search = toInfo(resources.search);
      }
    } catch {
      /* offline: keep old values */
    }
  }

  // ---------------------------------------------------------------------------

  private async fetchMany(repos: string[]): Promise<DataStatus> {
    if (repos.length === 0) return { kind: 'ok', dataDate: null };
    if (this.isExhausted(this.core)) return { kind: 'ratelimited', dataDate: null, resetAt: this.core.resetAt };

    let stop: DataStatus | null = null;
    let changed = false;
    await runPool(
      repos,
      CONCURRENCY,
      async (repo) => {
        try {
          const stats = await this.fetchRepo(repo);
          const fetchedAt = new Date(this.now()).toISOString();
          this.cache.repos[repo] = { stats, fetchedAt };
          this.entries[repo] = { stats, fetchedAt, source: 'live' };
          changed = true;
        } catch (err) {
          if (err instanceof RateLimitError) stop = { kind: 'ratelimited', dataDate: null, resetAt: err.resetAt };
          else if (err instanceof OfflineError) stop = { kind: 'offline', dataDate: null };
          // Other errors (404, 5xx): keep the old data for this repo silently.
        }
      },
      () => stop !== null,
    );
    if (changed) this.persist();
    return stop ?? { kind: 'ok', dataDate: null };
  }

  private async fetchRepo(repo: string): Promise<RepoStats> {
    const res = await this.request(`/repos/${repo}`);
    if (res.status !== 200) throw new HttpError(res.status);
    const rel = await this.request(`/repos/${repo}/releases/latest`);
    const release = rel.status === 200 ? (rel.json as Record<string, any>) : null;
    return toRepoStats(res.json as Record<string, any>, release);
  }

  private isExhausted(info: RateLimitInfo): boolean {
    if (info.remaining === null || info.remaining > 0) return false;
    if (!info.resetAt) return false;
    return Date.parse(info.resetAt) > this.now();
  }

  private async request(path: string, tokenOverride?: string): Promise<ApiResponse> {
    const token = tokenOverride ?? this.deps.getToken();
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': this.deps.userAgent ?? 'GratisStatt',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    let res: Response;
    try {
      res = await this.deps.fetch(`${API}${path}`, { headers });
    } catch {
      throw new OfflineError('offline');
    }

    const remaining = res.headers.get('x-ratelimit-remaining');
    const limit = res.headers.get('x-ratelimit-limit');
    const reset = res.headers.get('x-ratelimit-reset');
    const resource = res.headers.get('x-ratelimit-resource') ?? (path.startsWith('/search') ? 'search' : 'core');
    if (remaining !== null && path !== '/rate_limit' && !tokenOverride) {
      const info: RateLimitInfo = {
        limit: limit !== null ? Number(limit) : null,
        remaining: Number(remaining),
        resetAt: reset !== null ? new Date(Number(reset) * 1000).toISOString() : null,
      };
      if (resource === 'search') this.search = info;
      else if (resource === 'core') this.core = info;
    }

    if ((res.status === 403 || res.status === 429) && (remaining === '0' || res.headers.get('retry-after'))) {
      const retryAfter = res.headers.get('retry-after');
      const resetAt =
        reset !== null
          ? new Date(Number(reset) * 1000).toISOString()
          : retryAfter
            ? new Date(this.now() + Number(retryAfter) * 1000).toISOString()
            : null;
      throw new RateLimitError(resetAt);
    }

    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, json };
  }

  private persist() {
    try {
      this.deps.writeCache(JSON.stringify(this.cache));
    } catch {
      /* a cache that can't be written is not fatal */
    }
  }
}

function safeRead(read: () => string | null): string | null {
  try {
    return read();
  } catch {
    return null;
  }
}
