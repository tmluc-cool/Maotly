import type { GitHubClient, GitHubRepo } from './client';
import { MAX_RESULTS_PER_QUERY, PER_PAGE, type SearchFilter } from './config';
import { rootSlice, sliceQuery, splitSlice, type Slice } from './slices';

/** Resumable crawl state. Store it as JSON; pass it back in to continue exactly there. */
export interface CrawlState {
  /** Slices still to do. The first one is the current slice. */
  queue: Slice[];
  slicesDone: number;
  reposSeen: number;
  /** Slices that were still over the limit and could not be split (only the first 1000 were taken). */
  truncated: number;
}

export function initialCrawlState(filter: SearchFilter): CrawlState {
  return { queue: [rootSlice(filter)], slicesDone: 0, reposSeen: 0, truncated: 0 };
}

export interface CrawlOptions {
  client: GitHubClient;
  filter: SearchFilter;
  state: CrawlState;
  today: string;
  /** Store the repos (e.g. upsert in one transaction). */
  onRepos: (repos: GitHubRepo[]) => void | Promise<void>;
  /** Persist the state; called after each finished or split slice. */
  onState?: (state: CrawlState) => void | Promise<void>;
  shouldStop?: () => boolean;
  log?: (message: string) => void;
}

/**
 * Walks the search space slice by slice. Every query stays under GitHub's
 * 1000-result cap by halving slices that are too big.
 */
export async function crawl(o: CrawlOptions): Promise<'done' | 'stopped'> {
  const { client, filter, state } = o;
  while (state.queue.length > 0) {
    if (o.shouldStop?.()) return 'stopped';
    const slice = state.queue[0];
    const q = sliceQuery(filter, slice);
    const first = await client.searchRepos(q, { perPage: PER_PAGE, page: 1, sort: 'stars', order: 'desc' });

    if (first.total > MAX_RESULTS_PER_QUERY) {
      const parts = splitSlice(slice, filter, o.today);
      if (parts) {
        state.queue.splice(0, 1, ...parts);
        o.log?.(`split ${q} (${first.total})`);
        await o.onState?.(state);
        continue;
      }
      state.truncated++;
      o.log?.(`cannot split ${q} (${first.total}), taking the first ${MAX_RESULTS_PER_QUERY}`);
    }

    await o.onRepos(first.items);
    let seen = first.items.length;
    const pages = Math.ceil(Math.min(first.total, MAX_RESULTS_PER_QUERY) / PER_PAGE);
    for (let page = 2; page <= pages; page++) {
      // Stopping mid-slice is fine: the slice is redone later and upserts are idempotent.
      if (o.shouldStop?.()) return 'stopped';
      const res = await client.searchRepos(q, { perPage: PER_PAGE, page, sort: 'stars', order: 'desc' });
      if (res.items.length === 0) break;
      await o.onRepos(res.items);
      seen += res.items.length;
    }

    state.queue.shift();
    state.slicesDone++;
    state.reposSeen += seen;
    await o.onState?.(state);
  }
  return 'done';
}
