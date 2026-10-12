import type { AppUpdateInfo } from '../shared/types';

/** Compares "1.2.3" style versions (a leading "v" and suffixes like "-build.4" are ignored). Returns <0, 0 or >0. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/i, '')
      .split(/[-+]/)[0]
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Asks GitHub (anonymously) for the newest release of the app.
 * Only informs – nothing is downloaded or installed automatically.
 */
export async function checkAppUpdate(fetchFn: typeof fetch, releasesApiUrl: string, current: string): Promise<AppUpdateInfo | null> {
  try {
    const res = await fetchFn(releasesApiUrl, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'GratisStatt' },
    });
    if (!res.ok) return null;
    const rel = (await res.json()) as { tag_name?: string; html_url?: string; draft?: boolean; prerelease?: boolean };
    if (!rel.tag_name || !rel.html_url || rel.draft || rel.prerelease) return null;
    if (!/^https:\/\/github\.com\//.test(rel.html_url)) return null;
    const version = rel.tag_name.replace(/^v/i, '');
    return compareVersions(version, current) > 0 ? { version, url: rel.html_url } : null;
  } catch {
    return null; // offline: try again later
  }
}
