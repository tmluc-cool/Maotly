import type { RepoEntry, RepoStats, Snapshot } from './types';

export const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface CacheFile {
  version: 1;
  repos: Record<string, { stats: RepoStats; fetchedAt: string }>;
}

export function emptyCache(): CacheFile {
  return { version: 1, repos: {} };
}

/** Parses cache JSON defensively. Broken or foreign files give an empty cache. */
export function parseCache(raw: string | null | undefined): CacheFile {
  if (!raw) return emptyCache();
  try {
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || typeof data.repos !== 'object' || data.repos === null) {
      return emptyCache();
    }
    const repos: CacheFile['repos'] = {};
    for (const [key, value] of Object.entries(data.repos as Record<string, unknown>)) {
      const v = value as { stats?: RepoStats; fetchedAt?: string };
      if (v && v.stats && typeof v.fetchedAt === 'string' && !Number.isNaN(Date.parse(v.fetchedAt))) {
        repos[key] = { stats: v.stats, fetchedAt: v.fetchedAt };
      }
    }
    return { version: 1, repos };
  } catch {
    return emptyCache();
  }
}

/** Combines snapshot and cache; the newer entry wins per repo. */
export function mergeStats(snapshot: Snapshot, cache: CacheFile): Record<string, RepoEntry> {
  const out: Record<string, RepoEntry> = {};
  for (const [repo, stats] of Object.entries(snapshot.repos)) {
    out[repo] = { stats, fetchedAt: snapshot.generatedAt, source: 'snapshot' };
  }
  for (const [repo, entry] of Object.entries(cache.repos)) {
    const existing = out[repo];
    if (!existing || Date.parse(entry.fetchedAt) >= Date.parse(existing.fetchedAt)) {
      out[repo] = { stats: entry.stats, fetchedAt: entry.fetchedAt, source: 'cache' };
    }
  }
  return out;
}

export function isStale(fetchedAt: string | null | undefined, now: number, maxAgeMs = CACHE_MAX_AGE_MS): boolean {
  if (!fetchedAt) return true;
  const t = Date.parse(fetchedAt);
  if (Number.isNaN(t)) return true;
  return now - t > maxAgeMs;
}

/** Repos from the list whose data is missing or older than maxAge. */
export function reposNeedingRefresh(
  repos: string[],
  entries: Record<string, RepoEntry>,
  now: number,
  maxAgeMs = CACHE_MAX_AGE_MS,
): string[] {
  return [...new Set(repos)].filter((r) => {
    const e = entries[r];
    // Seed data (no push date yet) is incomplete and always worth one live refresh.
    if (!e || !e.stats.pushedAt) return true;
    return isStale(e.fetchedAt, now, maxAgeMs);
  });
}

/** Oldest fetchedAt among the given repos (ISO), or null. */
export function oldestDataDate(repos: string[], entries: Record<string, RepoEntry>): string | null {
  let oldest: number | null = null;
  for (const r of repos) {
    const e = entries[r];
    if (!e) continue;
    const t = Date.parse(e.fetchedAt);
    if (!Number.isNaN(t) && (oldest === null || t < oldest)) oldest = t;
  }
  return oldest === null ? null : new Date(oldest).toISOString();
}

export function newestDataDate(entries: Record<string, RepoEntry>): string | null {
  let newest: number | null = null;
  for (const e of Object.values(entries)) {
    if (e.source === 'snapshot') continue;
    const t = Date.parse(e.fetchedAt);
    if (!Number.isNaN(t) && (newest === null || t > newest)) newest = t;
  }
  return newest === null ? null : new Date(newest).toISOString();
}
