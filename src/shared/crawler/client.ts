import { SEARCH_INTERVAL_MS } from './config';

/** The fields we read from GitHub's repository objects. */
export interface GitHubRepo {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string } | null;
  description: string | null;
  topics?: string[];
  language: string | null;
  license: { spdx_id: string | null } | null;
  stargazers_count: number;
  forks_count?: number;
  archived: boolean;
  fork?: boolean;
  private?: boolean;
  homepage: string | null;
  html_url: string;
  created_at: string | null;
  pushed_at: string | null;
}

export interface SearchPage {
  total: number;
  incomplete: boolean;
  items: GitHubRepo[];
}

export interface SearchOptions {
  page?: number;
  perPage?: number;
  sort?: 'stars' | 'updated';
  order?: 'asc' | 'desc';
}

export interface ClientOptions {
  token?: string | null;
  fetch?: typeof fetch;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
  userAgent?: string;
  /** Called whenever the client waits (rate limit, backoff), e.g. for progress output. */
  onWait?: (ms: number, reason: string) => void;
  signal?: AbortSignal;
  maxRetries?: number;
}

export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export class OfflineError extends Error {}
export class AbortedError extends Error {}

export function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AbortedError('aborted'));
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new AbortedError('aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

type Resource = 'search' | 'core';

/**
 * Minimal GitHub REST client that never hammers the API:
 * spaces search requests, honours x-ratelimit-* and retry-after, backs off on errors.
 */
export class GitHubClient {
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  private readonly now: () => number;
  private readonly maxRetries: number;
  private nextAllowed: Record<Resource, number> = { search: 0, core: 0 };
  requests = 0;

  constructor(private opts: ClientOptions = {}) {
    this.fetchFn = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? defaultSleep;
    this.now = opts.now ?? Date.now;
    this.maxRetries = opts.maxRetries ?? 5;
  }

  get hasToken(): boolean {
    return !!this.opts.token;
  }

  async searchRepos(q: string, o: SearchOptions = {}): Promise<SearchPage> {
    const params = new URLSearchParams({
      q,
      per_page: String(o.perPage ?? 100),
      page: String(o.page ?? 1),
    });
    if (o.sort) params.set('sort', o.sort);
    if (o.order) params.set('order', o.order);
    const json = (await this.request('search', `/search/repositories?${params}`)) as {
      total_count: number;
      incomplete_results: boolean;
      items: GitHubRepo[];
    };
    return { total: json.total_count, incomplete: json.incomplete_results, items: json.items ?? [] };
  }

  /** Repo by numeric id (stable across renames). null if missing or private. */
  async getRepoById(id: number): Promise<GitHubRepo | null> {
    try {
      return (await this.request('core', `/repositories/${id}`)) as GitHubRepo;
    } catch (err) {
      if (err instanceof GitHubError && (err.status === 404 || err.status === 451)) return null;
      throw err;
    }
  }

  async getRepo(fullName: string): Promise<GitHubRepo | null> {
    try {
      return (await this.request('core', `/repos/${fullName}`)) as GitHubRepo;
    } catch (err) {
      if (err instanceof GitHubError && (err.status === 404 || err.status === 451)) return null;
      throw err;
    }
  }

  private async wait(ms: number, reason: string) {
    if (ms <= 0) return;
    this.opts.onWait?.(ms, reason);
    await this.sleep(ms, this.opts.signal);
  }

  private async request(resource: Resource, path: string): Promise<unknown> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': this.opts.userAgent ?? 'GratisStatt',
    };
    if (this.opts.token) headers.Authorization = `Bearer ${this.opts.token}`;

    for (let attempt = 0; ; attempt++) {
      if (this.opts.signal?.aborted) throw new AbortedError('aborted');
      await this.wait(this.nextAllowed[resource] - this.now(), 'rate-limit');
      if (resource === 'search') {
        this.nextAllowed.search = this.now() + (this.opts.token ? SEARCH_INTERVAL_MS.token : SEARCH_INTERVAL_MS.anonymous);
      }

      let res: Response;
      try {
        this.requests++;
        res = await this.fetchFn(`https://api.github.com${path}`, { headers, signal: this.opts.signal });
      } catch (err) {
        if (this.opts.signal?.aborted) throw new AbortedError('aborted');
        if (attempt >= Math.min(this.maxRetries, 3)) throw new OfflineError((err as Error).message);
        await this.wait(2000 * 2 ** attempt, 'network');
        continue;
      }

      const remaining = res.headers.get('x-ratelimit-remaining');
      const reset = Number(res.headers.get('x-ratelimit-reset'));
      const retryAfter = Number(res.headers.get('retry-after'));
      if (remaining === '0' && reset) {
        // Don't send the next request before the window resets.
        this.nextAllowed[resource] = Math.max(this.nextAllowed[resource], reset * 1000 + 1000);
      }

      if (res.ok) return res.json();

      if (res.status === 403 || res.status === 429) {
        if (attempt >= this.maxRetries) throw new GitHubError(res.status, 'GitHub rate limit');
        let waitMs: number;
        if (retryAfter > 0) waitMs = retryAfter * 1000;
        else if (remaining === '0' && reset) waitMs = reset * 1000 + 1000 - this.now();
        else waitMs = 60_000 * (attempt + 1); // secondary limit without hints: back off generously
        this.nextAllowed[resource] = Math.max(this.nextAllowed[resource], this.now() + waitMs);
        continue;
      }
      if (res.status >= 500 && attempt < this.maxRetries) {
        await this.wait(3000 * 2 ** attempt, 'server-error');
        continue;
      }
      let message = `GitHub ${res.status}`;
      try {
        message = ((await res.json()) as { message?: string }).message ?? message;
      } catch {
        /* ignore */
      }
      throw new GitHubError(res.status, message);
    }
  }
}
