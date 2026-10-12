import Database from 'better-sqlite3';
import { beforeAll, describe, expect, it } from 'vitest';
import topicMap from '../data/topic-map.json';
import { migrate, upsertRepos, type RepoRow } from '../src/shared/crawler';
import { registerFunctions, searchRepos, toFtsQuery, topicsClause } from '../src/shared/db/search';

const NOW = Date.parse('2026-10-12T12:00:00Z');

function row(id: number, p: Partial<RepoRow>): RepoRow {
  return {
    id, full_name: `o/r${id}`, name: `r${id}`, owner: 'o', description: null, topics: null, language: null, license: null,
    stars: 100, forks: null, archived: 0, homepage: null, html_url: `https://github.com/o/r${id}`, created_at: null,
    pushed_at: '2026-09-01T00:00:00Z', ...p,
  };
}

describe('toFtsQuery', () => {
  it('quotes every word and neutralises FTS syntax', () => {
    expect(toFtsQuery('Photo Shop')).toBe('"photo"* "shop"*');
    expect(toFtsQuery('a')).toBeNull();
    expect(toFtsQuery('  ')).toBeNull();
    expect(toFtsQuery('"); DROP TABLE repos; --')).toBe('"drop"* "table"* "repos"*');
    expect(toFtsQuery('NEAR(x y) OR * AND')).toBe('"near"* "or" "and"*');
    expect(toFtsQuery('Übersetzer')).toBe('"übersetzer"*');
  });
  it('builds topic clauses', () => {
    expect(topicsClause(['pdf', 'self-hosted'])).toBe('topics : ("pdf" OR "self hosted")');
  });
});

describe('searchRepos', () => {
  const db = new Database(':memory:');
  beforeAll(() => {
    migrate(db);
    registerFunctions(db);
    upsertRepos(db, [
      row(1, { full_name: 'GNOME/gimp', name: 'gimp', description: 'Image editor, Photoshop alternative', topics: 'image-editor', stars: 6000, license: 'GPL-3.0' }),
      row(2, { full_name: 'x/photoshop-scripts', name: 'photoshop-scripts', description: 'Scripts', stars: 50 }),
      row(3, { full_name: 'KDE/krita', name: 'krita', description: 'Painting program', topics: 'painting drawing', stars: 10000 }),
      row(4, { full_name: 'old/editor', name: 'editor', description: 'Old image editor', topics: 'image-editor', stars: 9000, archived: 1, pushed_at: '2020-01-01T00:00:00Z' }),
      row(5, { full_name: 'srv/cloud', name: 'cloud', description: 'Cloud storage', topics: 'self-hosted cloud-storage', stars: 3000, license: 'AGPL-3.0' }),
    ], 'base', '2026-01-01T00:00:00Z');
    upsertRepos(db, [row(6, { full_name: 'new/thing', name: 'thing', description: 'New image tool', stars: 120 })], 'live', '2026-10-11T00:00:00Z');
  });
  const ids = (p: Parameters<typeof searchRepos>[1]) => searchRepos(db, p, topicMap, NOW).items.map((i) => i.id);

  it('ranks by text relevance with a star bonus', () => {
    const r = ids({ q: 'photoshop' });
    expect(r).toContain(1);
    expect(r).toContain(2);
    expect(r[0]).toBe(1); // many stars wins over a name match with 50 stars
  });

  it('matches prefixes and name parts', () => {
    expect(ids({ q: 'kri' })).toEqual([3]);
    expect(ids({ q: 'gnome' })).toEqual([1]);
  });

  it('filters by category, platform, stars, license, activity and date', () => {
    expect(ids({ q: '', category: 'kreativ-design' }).sort()).toEqual([1, 3, 4]);
    expect(ids({ q: '', platform: 'server' })).toEqual([5]);
    expect(ids({ q: 'editor', minStars: 7000 })).toEqual([4]);
    expect(ids({ q: 'editor', activeOnly: true })).toEqual([1]);
    expect(ids({ q: '', licensed: true }).sort()).toEqual([1, 5]);
    expect(ids({ q: 'editor', updatedWithin: '6m' })).toEqual([1]);
  });

  it('sorts by stars, update and newly discovered', () => {
    expect(ids({ q: 'image', sort: 'stars' })).toEqual([4, 1, 6]);
    expect(ids({ q: '', sort: 'new' })[0]).toBe(6);
    expect(ids({ q: '', sort: 'updated' }).at(-1)).toBe(4);
  });

  it('pages and counts', () => {
    const r = searchRepos(db, { q: '', sort: 'stars', limit: 2, offset: 2 }, topicMap, NOW);
    expect(r.items.map((i) => i.id)).toEqual([1, 5]);
    expect(r.total).toBe(6);
  });

  it('survives hostile input', () => {
    expect(() => searchRepos(db, { q: '"*)(NEAR OR; DROP TABLE repos;--' }, topicMap, NOW)).not.toThrow();
    expect(searchRepos(db, { q: '', sort: 'stars' }, topicMap, NOW).total).toBe(6);
  });
});

describe('performance', () => {
  it('stays under 100 ms with 100,000 projects', () => {
    const db = new Database(':memory:');
    migrate(db);
    registerFunctions(db);
    let x = 42;
    const rnd = (n: number) => ((x = (x * 1103515245 + 12345) % 2 ** 31) % n);
    // Zipf-like vocabulary: a few very common words, many rare ones (like real descriptions).
    const common = ['app', 'tool', 'open', 'source', 'simple', 'fast', 'library', 'framework', 'self', 'hosted'];
    const themed = ['editor', 'image', 'cloud', 'notes', 'pdf', 'video', 'music', 'chat', 'budget', 'password', 'manager', 'server'];
    const rare = Array.from({ length: 3000 }, (_, i) => `w${i.toString(36)}x`);
    const word = () => {
      const r = rnd(100);
      if (r < 25) return common[rnd(common.length)];
      if (r < 35) return themed[rnd(themed.length)];
      return rare[Math.floor(Math.pow(rnd(10_000) / 10_000, 2) * rare.length)];
    };
    const topics = ['self-hosted', 'pdf', 'image-editor', 'notes', 'docker', 'windows', 'linux', 'ai', 'game', 'cms', 'cli', 'react'];
    const rows: RepoRow[] = [];
    for (let i = 1; i <= 100_000; i++) {
      rows.push(row(i, {
        full_name: `owner${rnd(20000)}/${word()}-${word()}-${i}`,
        description: Array.from({ length: 10 }, word).join(' '),
        topics: Array.from({ length: rnd(5) }, () => topics[rnd(topics.length)]).join(' ') || null,
        stars: 100 + Math.floor(Math.pow(rnd(10_000) / 10_000, 4) * 100_000),
        pushed_at: `202${rnd(7)}-0${1 + rnd(9)}-01T00:00:00Z`,
        license: rnd(3) ? 'MIT' : null,
      }));
    }
    upsertRepos(db, rows, 'base');
    db.prepare("INSERT INTO repos_fts(repos_fts) VALUES ('optimize')").run();

    const cases = [
      { q: 'image editor' },
      { q: 'app' }, // very common word: worst case for relevance sorting
      { q: 'pdf', sort: 'stars' as const },
      { q: 'cloud', category: 'speicher-medien', platform: 'server' as const, activeOnly: true, licensed: true },
      { q: '', category: 'kreativ-design', minStars: 1000 },
      { q: '', sort: 'new' as const },
      { q: '', sort: 'stars' as const, offset: 5000 },
      { q: 'manager', offset: 500 },
    ];
    for (const c of cases) {
      const times = Array.from({ length: 5 }, () => searchRepos(db, c, topicMap, NOW).tookMs).sort((a, b) => a - b);
      const median = times[2];
      expect(median, JSON.stringify(c)).toBeLessThan(100);
    }
  }, 120_000);
});

describe('similar projects', () => {
  it('matches any of the terms and excludes ids', () => {
    const db = new Database(':memory:');
    migrate(db);
    registerFunctions(db);
    upsertRepos(db, [
      row(1, { description: 'photoshop alternative' }),
      row(2, { description: 'image editor', stars: 500 }),
      row(3, { description: 'music player' }),
    ], 'base');
    const r = searchRepos(db, { q: '', anyOf: ['photoshop', 'image editor'], excludeIds: [1] }, topicMap, NOW);
    expect(r.items.map((i) => i.id)).toEqual([2]);
  });
});
