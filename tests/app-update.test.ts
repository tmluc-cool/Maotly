import { describe, expect, it } from 'vitest';
import { checkAppUpdate, compareVersions } from '../src/main/app-update';

describe('app update check', () => {
  it('compares versions', () => {
    expect(compareVersions('0.1.12', '0.1.9')).toBeGreaterThan(0);
    expect(compareVersions('v0.1.3', '0.1.3')).toBe(0);
    expect(compareVersions('0.1.0-build.1', '0.1.0')).toBe(0);
    expect(compareVersions('0.2.0', '0.10.0')).toBeLessThan(0);
  });

  it('reports only newer, published releases with a github.com link', async () => {
    const rel = (o: object) => (async () => Response.json({ tag_name: 'v0.1.5', html_url: 'https://github.com/o/r/releases/tag/v0.1.5', ...o })) as unknown as typeof fetch;
    expect(await checkAppUpdate(rel({}), 'u', '0.1.2')).toEqual({ version: '0.1.5', url: 'https://github.com/o/r/releases/tag/v0.1.5' });
    expect(await checkAppUpdate(rel({}), 'u', '0.1.5')).toBeNull();
    expect(await checkAppUpdate(rel({ prerelease: true }), 'u', '0.1.2')).toBeNull();
    expect(await checkAppUpdate(rel({ html_url: 'https://evil.example/x' }), 'u', '0.1.2')).toBeNull();
    const offline = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    expect(await checkAppUpdate(offline, 'u', '0.1.2')).toBeNull();
  });
});
