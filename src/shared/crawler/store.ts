import type Database from 'better-sqlite3';
import type { GitHubRepo } from './client';
import { REVIEWS_SQL } from '../db/reviews';

export type Db = Database.Database;
export type RepoSource = 'base' | 'delta' | 'manual' | 'live';

export const SCHEMA_VERSION = 2;

export interface RepoRow {
  id: number;
  full_name: string;
  name: string;
  owner: string;
  description: string | null;
  topics: string | null;
  language: string | null;
  license: string | null;
  stars: number;
  forks: number | null;
  archived: number;
  homepage: string | null;
  html_url: string;
  created_at: string | null;
  pushed_at: string | null;
}

export interface StoredRepo extends RepoRow {
  first_seen_at: string;
  last_seen_at: string;
  source: RepoSource;
}

/** Only public repo metadata is kept – no e-mails, no user profiles. */
export function toRepoRow(r: GitHubRepo): RepoRow {
  const spdx = r.license?.spdx_id;
  const [ownerFromName, nameFromName] = r.full_name.split('/');
  return {
    id: r.id,
    full_name: r.full_name,
    name: r.name ?? nameFromName,
    owner: r.owner?.login ?? ownerFromName,
    description: r.description ?? null,
    topics: r.topics && r.topics.length ? r.topics.join(' ') : null,
    language: r.language ?? null,
    license: spdx && spdx !== 'NOASSERTION' ? spdx : null,
    stars: r.stargazers_count ?? 0,
    forks: r.forks_count ?? null,
    archived: r.archived ? 1 : 0,
    homepage: r.homepage || null,
    html_url: r.html_url,
    created_at: r.created_at ?? null,
    pushed_at: r.pushed_at ?? null,
  };
}

const REPO_COLUMNS = [
  'id', 'full_name', 'name', 'owner', 'description', 'topics', 'language', 'license', 'stars', 'forks',
  'archived', 'homepage', 'html_url', 'created_at', 'pushed_at',
] as const;

/** Columns refreshed on update. first_seen_at and source are never overwritten. */
const UPDATE_SET = [...REPO_COLUMNS.filter((c) => c !== 'id'), 'last_seen_at']
  .map((c) => `${c} = excluded.${c}`)
  .join(', ');

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS repos (
  id            INTEGER PRIMARY KEY,
  full_name     TEXT NOT NULL,
  name          TEXT NOT NULL,
  owner         TEXT NOT NULL,
  description   TEXT,
  topics        TEXT,
  language      TEXT,
  license       TEXT,
  stars         INTEGER NOT NULL,
  forks         INTEGER,
  archived      INTEGER NOT NULL DEFAULT 0,
  homepage      TEXT,
  html_url      TEXT NOT NULL,
  created_at    TEXT,
  pushed_at     TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL,
  source        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS repos_stars ON repos(stars DESC);
CREATE INDEX IF NOT EXISTS repos_pushed ON repos(pushed_at DESC);
CREATE INDEX IF NOT EXISTS repos_first_seen ON repos(first_seen_at DESC);
CREATE INDEX IF NOT EXISTS repos_full_name ON repos(full_name COLLATE NOCASE);

CREATE VIRTUAL TABLE IF NOT EXISTS repos_fts USING fts5(
  full_name, description, topics,
  content='repos', content_rowid='id', tokenize='unicode61'
);
CREATE TRIGGER IF NOT EXISTS repos_ai AFTER INSERT ON repos BEGIN
  INSERT INTO repos_fts(rowid, full_name, description, topics) VALUES (new.id, new.full_name, new.description, new.topics);
END;
CREATE TRIGGER IF NOT EXISTS repos_ad AFTER DELETE ON repos BEGIN
  INSERT INTO repos_fts(repos_fts, rowid, full_name, description, topics) VALUES ('delete', old.id, old.full_name, old.description, old.topics);
END;
CREATE TRIGGER IF NOT EXISTS repos_au AFTER UPDATE ON repos BEGIN
  INSERT INTO repos_fts(repos_fts, rowid, full_name, description, topics) VALUES ('delete', old.id, old.full_name, old.description, old.topics);
  INSERT INTO repos_fts(rowid, full_name, description, topics) VALUES (new.id, new.full_name, new.description, new.topics);
END;

CREATE TABLE IF NOT EXISTS sync_runs (
  id          INTEGER PRIMARY KEY,
  kind        TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  status      TEXT NOT NULL,
  since       TEXT,
  added       INTEGER DEFAULT 0,
  updated     INTEGER DEFAULT 0,
  progress    TEXT
);

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS pending_submissions (
  repo_id     INTEGER PRIMARY KEY,
  found_at    TEXT NOT NULL
);
`;

/** Plain repos table, used for weekly update packages. */
export const PACKAGE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS repos (
  id INTEGER PRIMARY KEY, full_name TEXT NOT NULL, name TEXT NOT NULL, owner TEXT NOT NULL,
  description TEXT, topics TEXT, language TEXT, license TEXT, stars INTEGER NOT NULL, forks INTEGER,
  archived INTEGER NOT NULL DEFAULT 0, homepage TEXT, html_url TEXT NOT NULL, created_at TEXT, pushed_at TEXT,
  first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, source TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
`;

export function configure(db: Db) {
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
}

export function getMeta(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setMeta(db: Db, key: string, value: string | null) {
  if (value === null) db.prepare('DELETE FROM meta WHERE key = ?').run(key);
  else db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

/** Migrations by schema version. Each entry upgrades from version i to i+1. */
const MIGRATIONS: ((db: Db) => void)[] = [
  (db) => db.exec(SCHEMA_SQL), // 0 -> 1
  (db) => db.exec(REVIEWS_SQL), // 1 -> 2: reviews
];

export function schemaVersion(db: Db): number {
  const hasMeta = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='meta'").get();
  if (!hasMeta) return 0;
  return Number(getMeta(db, 'schema_version') ?? 0);
}

/**
 * Brings the database to SCHEMA_VERSION. `backup` is called before each migration
 * of an existing database (the caller copies the file).
 */
export function migrate(db: Db, backup?: (fromVersion: number) => void) {
  let version = schemaVersion(db);
  if (version > SCHEMA_VERSION) throw new Error(`Database schema ${version} is newer than this app (${SCHEMA_VERSION}).`);
  // A brand-new database needs no backup; an existing one gets one copy before it is changed.
  if (version > 0 && version < SCHEMA_VERSION) backup?.(version);
  while (version < SCHEMA_VERSION) {
    db.transaction(() => {
      MIGRATIONS[version](db);
      setMeta(db, 'schema_version', String(version + 1));
    })();
    version++;
  }
}

export interface UpsertResult {
  added: number;
  updated: number;
}

/** Upserts in transactions of 100. first_seen_at and source stay as they were. */
export function upsertRepos(db: Db, rows: RepoRow[], source: RepoSource, now = new Date().toISOString()): UpsertResult {
  const exists = db.prepare('SELECT 1 FROM repos WHERE id = ?').pluck();
  const insert = db.prepare(
    `INSERT INTO repos (${REPO_COLUMNS.join(', ')}, first_seen_at, last_seen_at, source)
     VALUES (${REPO_COLUMNS.map((c) => `@${c}`).join(', ')}, @now, @now, @source)
     ON CONFLICT(id) DO UPDATE SET ${UPDATE_SET}`,
  );
  const result: UpsertResult = { added: 0, updated: 0 };
  const batch = db.transaction((chunk: RepoRow[]) => {
    for (const row of chunk) {
      if (exists.get(row.id)) result.updated++;
      else result.added++;
      insert.run({ ...row, now, source });
    }
  });
  for (let i = 0; i < rows.length; i += 100) batch(rows.slice(i, i + 100));
  return result;
}

/**
 * Merges the repos table of another SQLite file (update package or base) in one transaction.
 * New rows get first_seen_at = now and the given source.
 */
export function mergeDatabase(db: Db, file: string, source: RepoSource, now = new Date().toISOString()): UpsertResult {
  db.prepare('ATTACH DATABASE ? AS pkg').run(file);
  try {
    return db.transaction(() => {
      const total = db.prepare('SELECT count(*) FROM pkg.repos').pluck().get() as number;
      const updated = db.prepare('SELECT count(*) FROM pkg.repos WHERE id IN (SELECT id FROM main.repos)').pluck().get() as number;
      db.prepare(
        `INSERT INTO main.repos (${REPO_COLUMNS.join(', ')}, first_seen_at, last_seen_at, source)
         SELECT ${REPO_COLUMNS.join(', ')}, @now, coalesce(last_seen_at, @now), @source FROM pkg.repos WHERE true
         ON CONFLICT(id) DO UPDATE SET ${UPDATE_SET}`,
      ).run({ now, source });
      return { added: total - updated, updated };
    })();
  } finally {
    db.prepare('DETACH DATABASE pkg').run();
  }
}

export function repoCount(db: Db): number {
  return db.prepare('SELECT count(*) FROM repos').pluck().get() as number;
}
