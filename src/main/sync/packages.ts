import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { getMeta, mergeDatabase, setMeta, type Db } from '../../shared/crawler/store';
import { replaceReviews, sanitizeReviews } from '../../shared/db/reviews';

export interface PackageEntry {
  /** Day of the package (YYYY-MM-DD). */
  date: string;
  file: string;
  url: string;
  count: number;
  size: number;
  sha256: string;
}

export interface Manifest {
  version: 1;
  generated_at: string;
  deltas: PackageEntry[];
  latest_base?: PackageEntry | null;
  /** All public reviews as JSON (only attached to the newest release). */
  reviews?: PackageEntry | null;
}

export interface PackageProgress {
  phase: 'manifest' | 'download' | 'merge';
  current?: string;
  index?: number;
  of?: number;
  added: number;
  updated: number;
}

export interface ApplyResult {
  applied: string[];
  usedBase: string | null;
  added: number;
  updated: number;
  /** Number of reviews loaded, or null if they were already up to date. */
  reviews: number | null;
}

export class ChecksumError extends Error {}

const ALLOWED_HOSTS = ['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'];

export function isAllowedPackageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && ALLOWED_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

export function parseManifest(json: unknown): Manifest {
  const m = json as Manifest;
  if (!m || m.version !== 1 || !Array.isArray(m.deltas)) throw new Error('Ungültiges Manifest');
  const ok = (e: PackageEntry) =>
    /^\d{4}-\d{2}-\d{2}$/.test(e.date) && /^[a-f0-9]{64}$/.test(e.sha256) && isAllowedPackageUrl(e.url);
  return {
    version: 1,
    generated_at: m.generated_at,
    deltas: m.deltas.filter(ok).sort((a, b) => a.date.localeCompare(b.date)),
    latest_base: m.latest_base && ok(m.latest_base) ? m.latest_base : null,
    reviews: m.reviews && ok(m.reviews) ? m.reviews : null,
  };
}

export function appliedDeltas(db: Db): string[] {
  try {
    const v = JSON.parse(getMeta(db, 'applied_deltas') ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Packages that are newer than the base and not applied yet, oldest first. */
export function missingDeltas(manifest: Manifest, applied: string[], baseVersion: string | null): PackageEntry[] {
  const done = new Set(applied);
  return manifest.deltas.filter((d) => !done.has(d.date) && (!baseVersion || d.date > baseVersion));
}

/** Downloads to a file while hashing; rejects if the SHA-256 differs. */
export async function downloadVerified(fetchFn: typeof fetch, entry: PackageEntry, file: string, signal?: AbortSignal) {
  if (!isAllowedPackageUrl(entry.url)) throw new Error(`Unerlaubte Adresse: ${entry.url}`);
  const res = await fetchFn(entry.url, { redirect: 'follow', signal });
  if (!res.ok || !res.body) throw new Error(`Download fehlgeschlagen (${res.status})`);
  const hash = createHash('sha256');
  const out = createWriteStream(file);
  // A write error (e.g. disk full) must end up as a normal error, not crash the worker.
  let writeError: Error | null = null;
  out.on('error', (e) => (writeError = e));
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (writeError) throw writeError;
      hash.update(value);
      if (!out.write(value)) {
        await new Promise<void>((r) => {
          out.once('drain', r);
          out.once('error', () => r());
        });
      }
    }
  } finally {
    await new Promise<void>((r) => (out.writableFinished || out.destroyed ? r() : out.end(() => r())));
  }
  if (writeError) {
    rmSync(file, { force: true });
    throw writeError;
  }
  const digest = hash.digest('hex');
  if (digest !== entry.sha256) {
    rmSync(file, { force: true });
    throw new ChecksumError(`Prüfsumme stimmt nicht für ${entry.file}`);
  }
}

export interface ApplyOptions {
  db: Db;
  fetch: typeof fetch;
  manifestUrl: string;
  tmpDir: string;
  maxMissing: number;
  signal?: AbortSignal;
  now?: () => string;
  onProgress?: (p: PackageProgress) => void;
}

/**
 * Loads the manifest, downloads missing packages (or the newest base if too many are missing),
 * checks every file against its SHA-256 and merges it. Each package is one transaction.
 */
export async function applyPackages(o: ApplyOptions): Promise<ApplyResult> {
  const now = o.now ?? (() => new Date().toISOString());
  const progress: PackageProgress = { phase: 'manifest', added: 0, updated: 0 };
  o.onProgress?.(progress);

  const res = await o.fetch(o.manifestUrl, { redirect: 'follow', signal: o.signal });
  if (res.status === 404) return { applied: [], usedBase: null, added: 0, updated: 0, reviews: null }; // nothing published yet
  if (!res.ok) throw new Error(`Manifest nicht erreichbar (${res.status})`);
  const manifest = parseManifest(await res.json());

  if (!existsSync(o.tmpDir)) mkdirSync(o.tmpDir, { recursive: true });
  const result: ApplyResult = { applied: [], usedBase: null, added: 0, updated: 0, reviews: null };
  let applied = appliedDeltas(o.db);
  let missing = missingDeltas(manifest, applied, getMeta(o.db, 'base_version'));

  const base = manifest.latest_base;
  if (missing.length > o.maxMissing && base && base.date > (getMeta(o.db, 'base_version') ?? '')) {
    const file = join(o.tmpDir, base.file);
    o.onProgress?.({ ...progress, phase: 'download', current: base.file });
    await downloadVerified(o.fetch, base, file, o.signal);
    o.onProgress?.({ ...progress, phase: 'merge', current: base.file });
    const r = mergeDatabase(o.db, file, 'base', now());
    rmSync(file, { force: true });
    result.added += r.added;
    result.updated += r.updated;
    result.usedBase = base.date;
    setMeta(o.db, 'base_version', base.date);
    if ((getMeta(o.db, 'last_delta_date') ?? '') < base.date) setMeta(o.db, 'last_delta_date', base.date);
    applied = [...new Set([...applied, ...manifest.deltas.filter((d) => d.date <= base.date).map((d) => d.date)])].sort();
    setMeta(o.db, 'applied_deltas', JSON.stringify(applied));
    missing = missingDeltas(manifest, applied, base.date);
  }

  for (const [i, d] of missing.entries()) {
    if (o.signal?.aborted) break;
    const file = join(o.tmpDir, d.file);
    o.onProgress?.({ ...progress, phase: 'download', current: d.file, index: i + 1, of: missing.length, added: result.added, updated: result.updated });
    await downloadVerified(o.fetch, d, file, o.signal);
    o.onProgress?.({ ...progress, phase: 'merge', current: d.file, index: i + 1, of: missing.length, added: result.added, updated: result.updated });
    const r = mergeDatabase(o.db, file, 'delta', now());
    rmSync(file, { force: true });
    result.added += r.added;
    result.updated += r.updated;
    applied = [...applied, d.date].sort();
    setMeta(o.db, 'applied_deltas', JSON.stringify(applied));
    setMeta(o.db, 'last_delta_date', d.date);
    result.applied.push(d.date);
  }
  // Reviews: one small JSON with all of them, replaced completely (deleted reviews disappear too).
  const rv = manifest.reviews;
  if (rv && !o.signal?.aborted && rv.sha256 !== getMeta(o.db, 'reviews_sha256')) {
    const file = join(o.tmpDir, `reviews-${rv.date}.json`);
    o.onProgress?.({ ...progress, phase: 'download', current: rv.file, added: result.added, updated: result.updated });
    await downloadVerified(o.fetch, rv, file, o.signal);
    try {
      const reviews = sanitizeReviews(JSON.parse(readFileSync(file, 'utf8')));
      result.reviews = replaceReviews(o.db, reviews, rv.date);
      setMeta(o.db, 'reviews_sha256', rv.sha256);
      setMeta(o.db, 'reviews_date', rv.date);
    } finally {
      rmSync(file, { force: true });
    }
  }
  return result;
}
