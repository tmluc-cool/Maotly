import type { GitHubRepo } from '../../src/shared/crawler';

/** A tiny fake of GitHub's search API: understands stars:/created: qualifiers and the 1000 cap. */
export function makeRepos(n: number, seed = 1): GitHubRepo[] {
  let x = seed;
  const rand = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  return Array.from({ length: n }, (_, i) => {
    // Heavy-tailed like real stars: many near 100, few huge ones.
    const stars = Math.floor(100 / Math.pow(rand() || 0.001, 0.9));
    const created = new Date(Date.UTC(2010, 0, 1) + Math.floor(rand() * 16 * 365) * 86_400_000).toISOString();
    return {
      id: i + 1,
      full_name: `owner${i % 97}/repo-${i + 1}`,
      name: `repo-${i + 1}`,
      owner: { login: `owner${i % 97}` },
      description: `Project number ${i + 1}`,
      topics: [],
      language: 'Go',
      license: { spdx_id: 'MIT' },
      stargazers_count: stars,
      forks_count: 1,
      archived: false,
      homepage: null,
      html_url: `https://github.com/owner${i % 97}/repo-${i + 1}`,
      created_at: created,
      pushed_at: '2026-09-01T00:00:00Z',
    };
  });
}

export function fakeSearchFetch(repos: GitHubRepo[], calls: string[] = []): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const q = url.searchParams.get('q') ?? '';
    calls.push(q);
    const page = Number(url.searchParams.get('page') ?? 1);
    const perPage = Number(url.searchParams.get('per_page') ?? 30);
    let list = repos;
    const range = q.match(/stars:(\d+)\.\.(\d+)/);
    const ge = q.match(/stars:>=(\d+)/);
    const eq = q.match(/stars:(\d+)(?!\.)(\s|$)/);
    if (range) list = list.filter((r) => r.stargazers_count >= +range[1] && r.stargazers_count <= +range[2]);
    else if (ge) list = list.filter((r) => r.stargazers_count >= +ge[1]);
    else if (eq) list = list.filter((r) => r.stargazers_count === +eq[1]);
    const cr = q.match(/created:(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})/);
    if (cr) list = list.filter((r) => r.created_at!.slice(0, 10) >= cr[1] && r.created_at!.slice(0, 10) <= cr[2]);
    const sorted = [...list].sort((a, b) => b.stargazers_count - a.stargazers_count || a.id - b.id);
    const start = (page - 1) * perPage;
    const items = start >= 1000 ? [] : sorted.slice(start, Math.min(start + perPage, 1000));
    return new Response(JSON.stringify({ total_count: list.length, incomplete_results: false, items }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '29', 'x-ratelimit-reset': '9999999999' },
    });
  }) as typeof fetch;
}
