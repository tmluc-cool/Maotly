import { GitHubError, GitHubClient, OfflineError } from '../shared/crawler/client';
import { toRepoRow } from '../shared/crawler/store';
import type { LiveSearchResult } from '../shared/types';
import type { AppDatabase } from './database';

const MAX_HITS = 50;

/** GitHub search query for the live search: name, description, README and topics. */
export function liveQuery(term: string): string | null {
  const clean = term.replace(/[:"\\()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  return clean ? `${clean} in:name,description,readme,topics fork:false` : null;
}

/**
 * Searches GitHub once, stores every hit locally (source 'live') and,
 * with the network switched on, queues new finds for submission.
 */
export async function liveSearch(
  db: AppDatabase,
  term: string,
  opts: { token: string | null; networkOn: boolean; fetch?: typeof fetch },
): Promise<LiveSearchResult> {
  const q = liveQuery(term);
  if (!q) return { ok: true, found: 0, fresh: 0, ids: [] };
  // One user-triggered request: no automatic retries, the user decides when to try again.
  const client = new GitHubClient({ token: opts.token, fetch: opts.fetch, maxRetries: 0, userAgent: 'GratisStatt' });
  try {
    const page = await client.searchRepos(q, { perPage: MAX_HITS, sort: 'stars', order: 'desc' });
    const rows = page.items.filter((r) => !r.private).map(toRepoRow);
    const fresh = db.storeLive(rows);
    if (opts.networkOn) db.queueSubmissions(rows.map((r) => r.id));
    return { ok: true, found: rows.length, fresh: fresh.length, ids: rows.map((r) => r.id) };
  } catch (err) {
    if (err instanceof OfflineError) return { ok: false, reason: 'offline' };
    if (err instanceof GitHubError && (err.status === 403 || err.status === 429)) {
      return { ok: false, reason: 'ratelimited', withToken: !!opts.token };
    }
    return { ok: false, reason: 'error', message: (err as Error).message };
  }
}
