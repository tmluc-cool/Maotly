import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppUpdater, checkAppUpdate, compareVersions, downloadInstaller, type InstallerAsset } from '../src/main/app-update';
import type { AppUpdateInfo } from '../src/shared/types';

const PAGE = 'https://github.com/o/r/releases/tag/v0.1.5';
const SETUP = 'https://github.com/o/r/releases/download/v0.1.5/Moatly-Setup-0.1.5.exe';
const bytes = Buffer.from('new Moatly installer '.repeat(5000));
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const asset = (o: object = {}) => ({ name: 'Moatly-Setup-0.1.5.exe', browser_download_url: SETUP, size: bytes.length, digest: `sha256:${sha256(bytes)}`, ...o });
const portable = { name: 'Moatly-0.1.5-portable.exe', browser_download_url: 'https://github.com/o/r/x.exe', size: 1, digest: `sha256:${'0'.repeat(64)}` };

/** A fake GitHub: the releases API and the installer download. */
function github(release: object, file: Buffer = bytes) {
  const calls: string[] = [];
  const fetchFn = (async (url: string) => {
    calls.push(url);
    if (url === SETUP) return new Response(new Uint8Array(file));
    return Response.json({ tag_name: 'v0.1.5', html_url: PAGE, assets: [portable, asset()], ...release });
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

describe('app update check', () => {
  it('compares versions', () => {
    expect(compareVersions('0.1.12', '0.1.9')).toBeGreaterThan(0);
    expect(compareVersions('v0.1.3', '0.1.3')).toBe(0);
    expect(compareVersions('0.1.0-build.1', '0.1.0')).toBe(0);
    expect(compareVersions('0.2.0', '0.10.0')).toBeLessThan(0);
  });

  it('reports only newer, published releases with a github.com link', async () => {
    const rel = (o: object) => github(o).fetchFn;
    expect(await checkAppUpdate(rel({}), 'u', '0.1.2')).toMatchObject({ version: '0.1.5', url: PAGE });
    expect(await checkAppUpdate(rel({}), 'u', '0.1.5')).toBeNull();
    expect(await checkAppUpdate(rel({ prerelease: true }), 'u', '0.1.2')).toBeNull();
    expect(await checkAppUpdate(rel({ html_url: 'https://evil.example/x' }), 'u', '0.1.2')).toBeNull();
    const offline = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    expect(await checkAppUpdate(offline, 'u', '0.1.2')).toBeNull();
  });

  it('picks the installer only with a github.com link and a SHA-256 from GitHub', async () => {
    const installer = async (a: object) => (await checkAppUpdate(github({ assets: [portable, a] }).fetchFn, 'u', '0.1.2'))?.installer;
    expect(await installer(asset())).toEqual({ name: 'Moatly-Setup-0.1.5.exe', url: SETUP, size: bytes.length, sha256: sha256(bytes) });
    expect(await installer(asset({ digest: undefined }))).toBeNull();
    expect(await installer(asset({ digest: 'md5:abc' }))).toBeNull();
    expect(await installer(asset({ browser_download_url: 'https://evil.example/Moatly-Setup.exe' }))).toBeNull();
    expect(await installer({ ...portable })).toBeNull();
  });
});

describe('installer download', () => {
  const target = (): InstallerAsset => ({ name: 'Moatly-Setup-0.1.5.exe', url: SETUP, size: bytes.length, sha256: sha256(bytes) });

  it('saves the file and reports progress', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'moatly-')), 'setup.exe');
    const shares: number[] = [];
    await downloadInstaller(github({}).fetchFn, target(), file, (s) => shares.push(s));
    expect(readFileSync(file).equals(bytes)).toBe(true);
    expect(shares.at(-1)).toBe(1);
  });

  it('deletes a damaged download', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'moatly-')), 'setup.exe');
    const damaged = Buffer.from(bytes);
    damaged[10] ^= 1;
    await expect(downloadInstaller(github({}, damaged).fetchFn, target(), file, () => {})).rejects.toThrow(/damaged/);
    expect(existsSync(file)).toBe(false);
    // Longer than announced: stops early.
    await expect(downloadInstaller(github({}, Buffer.concat([bytes, bytes])).fetchFn, target(), file, () => {})).rejects.toThrow(/damaged/);
    expect(existsSync(file)).toBe(false);
  });
});

describe('AppUpdater', () => {
  function setup(o: { canInstall?: boolean; file?: Buffer; launch?: (file: string) => Promise<void> } = {}) {
    const { fetchFn, calls } = github({}, o.file);
    const launched: string[] = [];
    const states: (AppUpdateInfo | null)[] = [];
    const updater = new AppUpdater({
      fetch: fetchFn,
      releasesApiUrl: 'u',
      currentVersion: '0.1.2',
      canInstall: o.canInstall ?? true,
      downloadDir: join(mkdtempSync(join(tmpdir(), 'moatly-')), 'update'),
      launchInstaller: o.launch ?? (async (file) => void launched.push(file)),
    });
    updater.on('state', (s) => states.push(s));
    return { updater, calls, launched, states };
  }

  it('downloads, checks and starts the installer', async () => {
    const { updater, launched, states } = setup();
    await updater.check();
    expect(updater.state()).toEqual({ version: '0.1.5', url: PAGE, canInstall: true, phase: 'available' });
    await updater.install();
    expect(launched).toHaveLength(1);
    expect(readFileSync(launched[0]).equals(bytes)).toBe(true);
    expect(states.map((s) => s?.phase)).toContain('downloading');
    expect(updater.state()?.phase).toBe('installing');
  });

  it('reports a damaged download and can try again', async () => {
    const damaged = Buffer.from(bytes);
    damaged[0] ^= 1;
    const { updater, launched } = setup({ file: damaged });
    await updater.check();
    await updater.install();
    expect(launched).toEqual([]);
    expect(updater.state()).toMatchObject({ phase: 'error', error: expect.stringMatching(/damaged/) });
  });

  it('reports an installer that does not start', async () => {
    const { updater } = setup({ launch: async () => Promise.reject(new Error('EACCES')) });
    await updater.check();
    await updater.install();
    expect(updater.state()).toMatchObject({ phase: 'error', error: expect.stringMatching(/could not be started/) });
  });

  it('never installs for the portable .exe', async () => {
    const { updater, calls, launched } = setup({ canInstall: false });
    await updater.check();
    expect(updater.state()?.canInstall).toBe(false);
    await updater.install();
    expect(launched).toEqual([]);
    expect(calls).not.toContain(SETUP);
  });
});
