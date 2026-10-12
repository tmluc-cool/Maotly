import { formatCount, formatDate } from '../lib/format';
import { href } from '../lib/router';
import { useApp } from '../state';

export function AboutPage() {
  const { info, stats } = useApp();

  const suggest = () => {
    if (!info) return;
    const body = [
      '**Für welches bezahlte Produkt?**',
      '',
      '**Welche Open-Source-Alternative (GitHub-Link)?**',
      '',
      '**Läuft auf (Windows, Mac, Linux, Android, iOS, Web, Server)?**',
      '',
      '**Wie schwierig ist die Installation (einfach, mittel, profi)?**',
      '',
    ].join('\n');
    void window.api.openExternal(
      `${info.projectRepoUrl}/issues/new?title=${encodeURIComponent('Alternative vorschlagen: ')}&body=${encodeURIComponent(body)}`,
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 pb-20 pt-8">
      <h1 className="text-3xl font-extrabold tracking-tight">Über GratisStatt</h1>
      <section className="card space-y-3">
        <p>
          GratisStatt zeigt dir kostenlose Open-Source-Projekte von GitHub, die bezahlte Software ersetzen können. Die
          Datenbank liegt auf deinem Computer – du kannst alles offline durchsuchen. Ohne Konto, ohne Werbung, ohne Tracking.
        </p>
        <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-1 text-sm">
          <dt className="text-slate-500 dark:text-slate-400">Version</dt>
          <dd>{info?.version ?? '…'}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Basis-Version</dt>
          <dd>{formatDate(stats?.baseVersion)}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Datenstand</dt>
          <dd>
            {formatDate(stats?.dataDate)}
            {stats && <> · {formatCount(stats.count)} Projekte</>}
          </dd>
        </dl>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={suggest}>
            Alternative vorschlagen
          </button>
          <a className="btn-secondary" href={href.privacy()}>
            Datenschutzerklärung
          </a>
        </div>
      </section>
      <section className="card space-y-2 text-sm text-slate-700 dark:text-slate-300">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Haftungsausschluss</h2>
        <p className="rounded-lg bg-amber-50 px-3 py-2 font-medium text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
          GratisStatt ist ein privates Spass-Projekt. Die Nutzung erfolgt auf eigene Gefahr. Es wird keinerlei Haftung
          übernommen – weder für die App selbst noch für die angezeigten Programme, Daten, Links oder Downloads.
        </p>
        <p>
          Die Angaben werden sorgfältig gepflegt, aber ohne Gewähr. Ob ein Projekt für dich passt, musst du selbst prüfen.
          Programme lädst du direkt bei GitHub oder auf der offiziellen Website herunter. Für Inhalt und Sicherheit der
          Programme sind deren Entwicklerinnen und Entwickler verantwortlich. Projekte ausserhalb der kuratierten Liste sind
          nicht von uns geprüft.
        </p>
        <p className="font-medium">Keine Verbindung zu den genannten Firmen. Produktnamen gehören den jeweiligen Inhabern.</p>
      </section>
    </div>
  );
}
