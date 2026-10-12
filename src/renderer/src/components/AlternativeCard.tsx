import type { Alternative, RepoEntry } from '@shared/types';
import { pickWindowsAsset } from '@shared/assets';
import { formatBytes, formatStars, maintenance, prettyRepoName, relativeTime } from '../lib/format';
import { useApp } from '../state';
import { LevelBadge, MaintenanceLight, PlatformList } from './badges';
import { CodeIcon, DownloadIcon, ExternalIcon, FolderIcon, StarIcon, WarningIcon } from './icons';

function isHttps(url: string | null | undefined): url is string {
  return !!url && /^https:\/\//i.test(url);
}

export function downloadPageUrl(alt: Alternative, entry: RepoEntry | undefined): string {
  if (isHttps(alt.website)) return alt.website;
  if (isHttps(entry?.stats.homepage)) return entry!.stats.homepage!;
  return `https://github.com/${alt.repo}/releases`;
}

export function AlternativeCard({ alt, entry }: { alt: Alternative; entry: RepoEntry | undefined }) {
  const { downloads, startDownload } = useApp();
  const stats = entry?.stats;
  const light = maintenance(stats);
  const asset = pickWindowsAsset(stats?.latestRelease?.assets);
  const dl = downloads[alt.repo];
  const open = (url: string) => void window.api.openExternal(url);

  let updatedText: string;
  if (stats?.archived) updatedText = 'Archiviert – wird nicht mehr gepflegt';
  else if (stats?.pushedAt) updatedText = `Zuletzt aktualisiert ${relativeTime(stats.pushedAt)}`;
  else updatedText = 'Aktualität noch unbekannt';

  const percent = dl && dl.total ? Math.min(100, Math.round((dl.received / dl.total) * 100)) : null;

  return (
    <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold">{prettyRepoName(alt.repo)}</h3>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{alt.repo}</p>
        </div>
        <LevelBadge level={alt.level} />
      </header>

      <p className="mt-3 text-slate-700 dark:text-slate-300">{alt.summary}</p>

      {alt.note && (
        <p className="mt-3 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
          <WarningIcon className="mt-0.5 shrink-0" />
          <span>{alt.note}</span>
        </p>
      )}

      <dl className="mt-4 grid grid-cols-[auto,1fr] items-center gap-x-3 gap-y-2 text-sm">
        <dt className="sr-only">Sterne</dt>
        <dd className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1 font-semibold" title={`${stats?.stars ?? '?'} Sterne auf GitHub`}>
            <StarIcon className="text-amber-500" />
            {stats ? formatStars(stats.stars) : '–'}
          </span>
          <span className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <MaintenanceLight value={light} />
            {updatedText}
          </span>
        </dd>
        <dt className="text-slate-500 dark:text-slate-400">Lizenz</dt>
        <dd>{stats?.license ?? 'unbekannt'}</dd>
        <dt className="text-slate-500 dark:text-slate-400">Läuft auf</dt>
        <dd>
          <PlatformList platforms={alt.platforms} />
        </dd>
      </dl>

      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        {asset ? (
          dl?.state === 'running' ? (
            <div className="w-full">
              <div className="mb-1 flex justify-between text-xs text-slate-600 dark:text-slate-400">
                <span>Wird heruntergeladen …</span>
                <span>{percent !== null ? `${percent} %` : formatBytes(dl.received)}</span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent ?? undefined}
              >
                <div
                  className={`h-full rounded-full bg-brand-500 transition-all ${percent === null ? 'animate-pulse' : ''}`}
                  style={{ width: `${percent ?? 100}%` }}
                />
              </div>
            </div>
          ) : dl?.state === 'done' ? (
            <div className="w-full rounded-lg bg-emerald-50 p-3 text-sm dark:bg-emerald-900/30">
              <p className="font-medium text-emerald-900 dark:text-emerald-100">„{dl.fileName}“ ist im Downloads-Ordner.</p>
              <p className="mt-0.5 text-emerald-800 dark:text-emerald-200">Die Datei wird nicht automatisch geöffnet. Starte sie selbst per Doppelklick.</p>
              <button type="button" className="btn-secondary mt-2" onClick={() => void window.api.showDownload(dl.id)}>
                <FolderIcon /> Im Ordner anzeigen
              </button>
            </div>
          ) : (
            <>
              <button type="button" className="btn-primary w-full justify-center" onClick={() => void startDownload(alt.repo, asset.name)}>
                <DownloadIcon /> Windows-Installer herunterladen
              </button>
              {dl?.state === 'error' && (
                <p className="w-full text-sm text-rose-700 dark:text-rose-300">Download fehlgeschlagen: {dl.message}</p>
              )}
            </>
          )
        ) : (
          <button type="button" className="btn-primary" onClick={() => open(downloadPageUrl(alt, entry))}>
            <ExternalIcon /> Zur Download-Seite
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={() => open(`https://github.com/${alt.repo}`)}>
          <CodeIcon /> Auf GitHub ansehen
        </button>
      </div>
      {asset && stats?.latestRelease && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Version {stats.latestRelease.tag} · {formatBytes(asset.size)} · {asset.name}
        </p>
      )}
    </article>
  );
}
