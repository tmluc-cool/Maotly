import type { Db, RepoSource } from '../crawler/store';
import type { Platform } from '../types';

export type SortKey = 'relevance' | 'stars' | 'updated' | 'new';
export type UpdatedWithin = '6m' | '1y' | '2y' | 'any';

export interface SearchParams {
  q: string;
  /** Additional terms of which at least one must match (e.g. product name and aliases). */
  anyOf?: string[];
  excludeIds?: number[];
  category?: string | null;
  platform?: Platform | null;
  minStars?: number;
  updatedWithin?: UpdatedWithin;
  licensed?: boolean;
  activeOnly?: boolean;
  sort?: SortKey;
  offset?: number;
  limit?: number;
}

export interface RepoResult {
  id: number;
  full_name: string;
  name: string;
  owner: string;
  description: string | null;
  topics: string | null;
  language: string | null;
  license: string | null;
  stars: number;
  archived: number;
  homepage: string | null;
  html_url: string;
  pushed_at: string | null;
  first_seen_at: string;
  source: RepoSource;
}

export interface SearchResult {
  items: RepoResult[];
  /** Number of matches, capped at COUNT_CAP. */
  total: number;
  capped: boolean;
  tookMs: number;
}

export interface TopicMap {
  categories: Record<string, string[]>;
  platforms: Record<string, string[]>;
}

export const COUNT_CAP = 10_000;
const MAX_LIMIT = 200;
const RESULT_COLUMNS =
  'r.id, r.full_name, r.name, r.owner, r.description, r.topics, r.language, r.license, r.stars, r.archived, r.homepage, r.html_url, r.pushed_at, r.first_seen_at, r.source';

/**
 * Turns free text into a safe FTS5 query: every word becomes a quoted phrase
 * (so operators and special characters lose their meaning), longer words get a prefix match.
 * Returns null if nothing searchable is left.
 */
export function toFtsQuery(input: string): string | null {
  const words = input
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 2)
    .slice(0, 8);
  if (words.length === 0) return null;
  return words.map((w) => (w.length >= 3 ? `"${w}"*` : `"${w}"`)).join(' ');
}

/** FTS clause matching any of the topics (topics with dashes become phrases). */
export function topicsClause(topics: string[]): string | null {
  const parts = [...new Set(topics)]
    .map((t) => t.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(' '))
    .filter(Boolean)
    .map((t) => `"${t}"`);
  return parts.length ? `topics : (${parts.join(' OR ')})` : null;
}

export function monthsAgo(now: number, months: number): string {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString();
}

export function cutoffDate(within: UpdatedWithin | undefined, now: number): string | null {
  const months = within === '6m' ? 6 : within === '1y' ? 12 : within === '2y' ? 24 : null;
  return months === null ? null : monthsAgo(now, months);
}

export function searchRepos(db: Db, p: SearchParams, topicMap: TopicMap, now = Date.now()): SearchResult {
  const started = performance.now();
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  const fts: string[] = [];
  const text = toFtsQuery(p.q ?? '');
  if (text) fts.push(`(${text})`);
  const alternatives = (p.anyOf ?? []).map(toFtsQuery).filter((x): x is string => !!x);
  if (alternatives.length) fts.push(`(${alternatives.map((a) => `(${a})`).join(' OR ')})`);
  const hasText = !!text || alternatives.length > 0;
  if (p.category) {
    const c = topicsClause(topicMap.categories[p.category] ?? []);
    if (c) fts.push(c);
  }
  if (p.platform) {
    const c = topicsClause(topicMap.platforms[p.platform] ?? []);
    if (c) fts.push(c);
  }
  const useFts = fts.length > 0;
  if (useFts) {
    where.push('repos_fts MATCH @fts');
    params.fts = fts.join(' AND ');
  }

  if (p.minStars && p.minStars > 0) {
    where.push('r.stars >= @minStars');
    params.minStars = Math.floor(p.minStars);
  }
  const cutoff = cutoffDate(p.updatedWithin, now);
  if (cutoff) {
    where.push('r.pushed_at >= @cutoff');
    params.cutoff = cutoff;
  }
  if (p.licensed) where.push('r.license IS NOT NULL');
  if (p.excludeIds?.length) {
    where.push('r.id NOT IN (SELECT value FROM json_each(@exclude))');
    params.exclude = JSON.stringify(p.excludeIds);
  }
  if (p.activeOnly) {
    where.push('r.archived = 0 AND r.pushed_at >= @activeCutoff');
    // "Aktiv gepflegt" = traffic light not red: changed within 18 months.
    params.activeCutoff = monthsAgo(now, 18);
  }

  const sort: SortKey = p.sort === 'relevance' && !hasText ? 'stars' : (p.sort ?? (hasText ? 'relevance' : 'stars'));
  const order =
    sort === 'relevance'
      ? // bm25 is negative (lower = better). Stars add a logarithmic bonus, archived a penalty.
        'bm25(repos_fts, 8.0, 2.0, 3.0) - ln(r.stars + 1) * 0.8 + r.archived * 4 ASC'
      : sort === 'updated'
        ? 'r.pushed_at DESC'
        : sort === 'new'
          ? 'r.first_seen_at DESC'
          : 'r.stars DESC';

  const from = useFts ? 'repos_fts JOIN repos r ON r.id = repos_fts.rowid' : 'repos r';
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(Math.max(1, p.limit ?? 50), MAX_LIMIT);
  const offset = Math.max(0, p.offset ?? 0);

  const items = db
    .prepare(`SELECT ${RESULT_COLUMNS} FROM ${from} ${whereSql} ORDER BY ${order} LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset }) as RepoResult[];

  let total: number;
  if (offset === 0 && items.length < limit) total = items.length;
  else
    total = db
      .prepare(`SELECT count(*) FROM (SELECT 1 FROM ${from} ${whereSql} LIMIT ${COUNT_CAP + 1})`)
      .pluck()
      .get(params) as number;

  return {
    items,
    total: Math.min(total, COUNT_CAP),
    capped: total > COUNT_CAP,
    tookMs: Math.round(performance.now() - started),
  };
}

/** Looks up curated repos by "owner/name" (case-insensitive). */
export function reposByFullName(db: Db, names: string[]): Record<string, RepoResult> {
  if (names.length === 0) return {};
  const stmt = db.prepare(`SELECT ${RESULT_COLUMNS} FROM repos r WHERE r.full_name = ? COLLATE NOCASE ORDER BY r.last_seen_at DESC LIMIT 1`);
  const out: Record<string, RepoResult> = {};
  for (const n of names) {
    const row = stmt.get(n) as RepoResult | undefined;
    if (row) out[n] = row;
  }
  return out;
}

/** Newest projects from the update packages and manual updates. */
export function newlyDiscovered(db: Db, limit = 12): RepoResult[] {
  return db
    .prepare(
      `SELECT ${RESULT_COLUMNS} FROM repos r WHERE r.source IN ('delta', 'manual') AND r.archived = 0
       ORDER BY r.first_seen_at DESC, r.stars DESC LIMIT ?`,
    )
    .all(limit) as RepoResult[];
}

/** Registers SQL functions the queries need (ln is missing in some SQLite builds). */
export function registerFunctions(db: Db) {
  try {
    db.prepare('SELECT ln(1)').get();
  } catch {
    db.function('ln', { deterministic: true }, (x: unknown) => Math.log(Number(x)));
  }
}
