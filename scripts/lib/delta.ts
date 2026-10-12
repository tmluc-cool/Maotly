import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { SUBMISSION_MIN_STARS, type GitHubRepo } from '../../src/shared/crawler';
import type { Manifest, PackageEntry } from '../../src/main/sync/packages';

export type Verdict = { status: 'accepted'; repoName: string } | { status: 'rejected'; reason: string };

/** Checks a network submission ourselves at GitHub: exists, public, not a fork, enough stars. */
export function checkSubmission(repo: GitHubRepo | null): Verdict {
  if (!repo) return { status: 'rejected', reason: 'Existiert nicht (mehr)' };
  if (repo.private) return { status: 'rejected', reason: 'Nicht öffentlich' };
  if (repo.fork) return { status: 'rejected', reason: 'Fork' };
  if ((repo.stargazers_count ?? 0) < SUBMISSION_MIN_STARS) return { status: 'rejected', reason: `Weniger als ${SUBMISSION_MIN_STARS} Sterne` };
  return { status: 'accepted', repoName: repo.full_name };
}

export function fileEntry(path: string, date: string, url: string, count: number): PackageEntry {
  const buf = readFileSync(path);
  return {
    date,
    file: basename(path),
    url,
    count,
    size: statSync(path).size,
    sha256: createHash('sha256').update(buf).digest('hex'),
  };
}

/** "Since" for the next package: the newest package or base, otherwise one week back. */
export function sinceFrom(prev: Manifest | null, fallback: string): string {
  const dates = [...(prev?.deltas.map((d) => d.date) ?? []), prev?.latest_base?.date].filter((d): d is string => !!d).sort();
  return dates.at(-1) ?? fallback;
}

export function nextManifest(
  prev: Manifest | null,
  delta: PackageEntry,
  base: PackageEntry | null,
  now: string,
  reviews: PackageEntry | null = null,
): Manifest {
  const deltas = [...(prev?.deltas ?? []).filter((d) => d.date !== delta.date), delta].sort((a, b) => a.date.localeCompare(b.date));
  // Reviews only point to the newest release: older copies are removed from earlier releases.
  return { version: 1, generated_at: now, deltas, latest_base: base ?? prev?.latest_base ?? null, reviews };
}
