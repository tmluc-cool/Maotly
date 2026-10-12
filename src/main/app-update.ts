import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { t } from '../shared/i18n';
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

/** The installer of a release, with the SHA-256 that GitHub computed when it was uploaded. */
export interface InstallerAsset {
  name: string;
  url: string;
  size: number;
  sha256: string;
}

export interface LatestRelease {
  version: string;
  /** Release page on GitHub. */
  url: string;
  /** null: the release has no installer with a checksum, so only the download page can be offered. */
  installer: InstallerAsset | null;
}

const INSTALLER_NAME = /^Moatly-Setup-[\w.-]+\.exe$/;

function installerAsset(assets: unknown): InstallerAsset | null {
  if (!Array.isArray(assets)) return null;
  const asset = assets.find((a): a is Record<string, unknown> => typeof a?.name === 'string' && INSTALLER_NAME.test(a.name));
  if (!asset) return null;
  const { name, browser_download_url: url, size, digest } = asset;
  if (typeof url !== 'string' || !url.startsWith('https://github.com/')) return null;
  if (typeof size !== 'number' || size <= 0) return null;
  if (typeof digest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(digest)) return null;
  return { name: name as string, url, size, sha256: digest.slice('sha256:'.length) };
}

/** Asks GitHub (anonymously) for the newest release of the app. null: no newer version (or offline). */
export async function checkAppUpdate(fetchFn: typeof fetch, releasesApiUrl: string, current: string): Promise<LatestRelease | null> {
  try {
    const res = await fetchFn(releasesApiUrl, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Moatly' },
    });
    if (!res.ok) return null;
    const rel = (await res.json()) as { tag_name?: string; html_url?: string; draft?: boolean; prerelease?: boolean; assets?: unknown };
    if (!rel.tag_name || !rel.html_url || rel.draft || rel.prerelease) return null;
    if (!/^https:\/\/github\.com\//.test(rel.html_url)) return null;
    const version = rel.tag_name.replace(/^v/i, '');
    if (compareVersions(version, current) <= 0) return null;
    return { version, url: rel.html_url, installer: installerAsset(rel.assets) };
  } catch {
    return null; // offline: try again later
  }
}

export class DamagedDownload extends Error {
  constructor() {
    super(t('main.updateDamaged'));
  }
}

/** Downloads the installer to `file` and checks size and SHA-256. A damaged file is deleted. */
export async function downloadInstaller(fetchFn: typeof fetch, asset: InstallerAsset, file: string, onProgress: (share: number) => void): Promise<void> {
  const res = await fetchFn(asset.url, { headers: { 'User-Agent': 'Moatly' } });
  if (!res.ok || !res.body) throw new Error(t('main.updateDownloadFailed'));
  const hash = createHash('sha256');
  let received = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      received += chunk.length;
      if (received > asset.size) return done(new DamagedDownload());
      hash.update(chunk);
      onProgress(received / asset.size);
      done(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(res.body as unknown as NodeReadableStream), meter, createWriteStream(file));
    if (received !== asset.size || hash.digest('hex') !== asset.sha256) throw new DamagedDownload();
  } catch (err) {
    await rm(file, { force: true });
    throw err;
  }
}

export interface AppUpdaterDeps {
  fetch: typeof fetch;
  releasesApiUrl: string;
  currentVersion: string;
  /** Installed with the setup on Windows (not the portable .exe): the app can update itself. */
  canInstall: boolean;
  /** Folder for the downloaded installer; emptied before each download. */
  downloadDir: string;
  /** Starts the installer (silent, restarts the app afterwards) and quits the app. */
  launchInstaller: (file: string) => Promise<void>;
}

/**
 * New app versions: checks GitHub for a newer release. A click on "Update" downloads the installer,
 * checks it against GitHub's SHA-256 and installs it silently; the installer starts Moatly again.
 * The portable .exe can't replace itself, so there the click opens the download page.
 */
export class AppUpdater extends EventEmitter {
  private release: LatestRelease | null = null;
  private info: AppUpdateInfo | null = null;
  private busy = false;

  constructor(private deps: AppUpdaterDeps) {
    super();
  }

  state(): AppUpdateInfo | null {
    return this.info;
  }

  private set(info: AppUpdateInfo | null) {
    this.info = info;
    this.emit('state', info);
  }

  async check(): Promise<void> {
    if (this.busy) return;
    const release = await checkAppUpdate(this.deps.fetch, this.deps.releasesApiUrl, this.deps.currentVersion);
    if (this.busy) return; // an installation started meanwhile
    this.release = release;
    this.set(release && { version: release.version, url: release.url, canInstall: this.deps.canInstall && !!release.installer, phase: 'available' });
  }

  /** Downloads, checks and installs the new version. Errors end up in the state (phase 'error'). */
  async install(): Promise<void> {
    const release = this.release;
    const info = this.info;
    if (this.busy || !release?.installer || !info?.canInstall) return;
    this.busy = true;
    const fail = (error: string) => {
      this.busy = false;
      this.set({ ...info, phase: 'error', error });
    };

    let shown = -1;
    const progress = (percent: number) => {
      if (percent === shown) return;
      shown = percent;
      this.set({ ...info, phase: 'downloading', progress: percent });
    };
    const file = join(this.deps.downloadDir, release.installer.name);
    try {
      progress(0);
      await rm(this.deps.downloadDir, { recursive: true, force: true });
      await mkdir(this.deps.downloadDir, { recursive: true });
      await downloadInstaller(this.deps.fetch, release.installer, file, (share) => progress(Math.floor(share * 100)));
    } catch (err) {
      return fail(err instanceof DamagedDownload ? err.message : err instanceof TypeError ? t('main.githubUnreachable') : t('main.updateDownloadFailed'));
    }

    this.set({ ...info, phase: 'installing', progress: 100 });
    try {
      await this.deps.launchInstaller(file);
      // The app quits now; staying busy keeps checks and clicks from starting anything new.
    } catch {
      fail(t('main.updateStartFailed'));
    }
  }
}
