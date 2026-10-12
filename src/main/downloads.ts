import { app, net, type WebContents } from 'electron';
import { createWriteStream, existsSync, renameSync, rmSync, type WriteStream } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { IPC } from '../shared/ipc';
import type { DownloadEvent, ReleaseAsset } from '../shared/types';

const ALLOWED_HOSTS = new Set(['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']);

const finished = new Map<string, string>();

export function isAllowedDownloadUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && ALLOWED_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

/** Keeps only harmless characters and adds (1), (2)… if the file already exists. */
function targetPath(name: string): string {
  const safe = basename(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'download';
  const dir = app.getPath('downloads');
  const ext = extname(safe);
  const stem = safe.slice(0, safe.length - ext.length);
  let candidate = join(dir, safe);
  for (let i = 1; existsSync(candidate); i++) candidate = join(dir, `${stem} (${i})${ext}`);
  return candidate;
}

/**
 * Downloads a release asset into the Downloads folder.
 * The file is never opened or executed.
 */
export function startDownload(asset: ReleaseAsset, sender: WebContents): string {
  const id = randomUUID();
  const send = (event: DownloadEvent) => {
    if (!sender.isDestroyed()) sender.send(IPC.downloadEvent, event);
  };
  const path = targetPath(asset.name);

  void (async () => {
    const tmp = `${path}.part`;
    let out: WriteStream | null = null;
    try {
      const res = await net.fetch(asset.url, { redirect: 'follow' });
      if (!res.ok || !res.body) throw new Error(`Download fehlgeschlagen (${res.status})`);
      const finalHost = new URL(res.url || asset.url).hostname;
      if (!finalHost.endsWith('github.com') && !finalHost.endsWith('githubusercontent.com')) {
        throw new Error('Unerwartete Download-Adresse.');
      }
      const total = Number(res.headers.get('content-length')) || asset.size || null;
      out = createWriteStream(tmp);
      const stream = out;
      let writeError: Error | null = null;
      stream.on('error', (e) => (writeError = e));
      let received = 0;
      let lastSent = 0;
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (writeError) throw writeError;
        received += value.byteLength;
        if (!stream.write(value)) await new Promise<void>((r) => stream.once('drain', () => r()));
        const now = Date.now();
        if (now - lastSent > 150) {
          lastSent = now;
          send({ id, type: 'progress', received, total });
        }
      }
      await new Promise<void>((resolve, reject) => stream.end((err?: Error | null) => (err ? reject(err) : resolve())));
      renameSync(tmp, path);
      finished.set(id, path);
      send({ id, type: 'progress', received, total: total ?? received });
      send({ id, type: 'done', fileName: basename(path) });
    } catch (err) {
      out?.destroy();
      try {
        rmSync(tmp, { force: true });
      } catch {
        /* file may still be locked */
      }
      send({ id, type: 'error', message: (err as Error).message || 'Download fehlgeschlagen' });
    }
  })();

  return id;
}

export function downloadedPath(id: string): string | undefined {
  return finished.get(id);
}
