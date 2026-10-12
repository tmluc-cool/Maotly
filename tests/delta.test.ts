import { describe, expect, it } from 'vitest';
import { checkSubmission, nextManifest, sinceFrom } from '../scripts/lib/delta';
import { makeRepos } from './helpers/fake-github';

const repo = (p: object) => ({ ...makeRepos(1)[0], stargazers_count: 50, ...p });

describe('weekly package helpers', () => {
  it('checks network submissions at GitHub', () => {
    expect(checkSubmission(null)).toEqual({ status: 'rejected', reason: 'Existiert nicht (mehr)' });
    expect(checkSubmission(repo({ private: true })).status).toBe('rejected');
    expect(checkSubmission(repo({ fork: true }))).toEqual({ status: 'rejected', reason: 'Fork' });
    expect(checkSubmission(repo({ stargazers_count: 19 })).status).toBe('rejected');
    expect(checkSubmission(repo({ stargazers_count: 20 }))).toEqual({ status: 'accepted', repoName: 'owner0/repo-1' });
  });

  it('continues from the newest package or base', () => {
    const e = (date: string) => ({ date, file: '', url: '', count: 0, size: 0, sha256: '' });
    expect(sinceFrom(null, '2026-10-05')).toBe('2026-10-05');
    expect(sinceFrom({ version: 1, generated_at: '', deltas: [e('2026-09-28'), e('2026-10-05')], latest_base: e('2026-10-06') }, 'x')).toBe('2026-10-06');
  });

  it('appends the new package and keeps the base', () => {
    const e = (date: string) => ({ date, file: `d-${date}`, url: '', count: 1, size: 1, sha256: 'a' });
    const prev = { version: 1 as const, generated_at: '', deltas: [e('2026-10-05')], latest_base: e('2026-10-01') };
    const m = nextManifest(prev, e('2026-10-12'), null, 'now');
    expect(m.deltas.map((d) => d.date)).toEqual(['2026-10-05', '2026-10-12']);
    expect(m.latest_base?.date).toBe('2026-10-01');
    expect(nextManifest(m, e('2026-10-12'), e('2026-10-12'), 'now').deltas.length).toBe(2); // re-run same day replaces
  });
});
