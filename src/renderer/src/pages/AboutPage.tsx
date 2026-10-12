import { formatDate } from '../lib/format';
import { useApp } from '../state';

export function AboutPage() {
  const { info, snapshotDate, newestFetch } = useApp();

  const suggest = () => {
    if (!info) return;
    const title = 'Alternative vorschlagen: ';
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
      `${info.projectRepoUrl}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`,
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 pb-16 pt-8">
      <h1 className="text-3xl font-extrabold tracking-tight">Über GratisStatt</h1>

      <section className="card space-y-3">
        <p>
          GratisStatt zeigt dir kostenlose Open-Source-Programme von GitHub, die bezahlte Software ersetzen können. Alles
          läuft lokal auf deinem Computer – ohne Konto, ohne Werbung und ohne Tracking. Die App spricht nur mit GitHub.
        </p>
        <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-1 text-sm">
          <dt className="text-slate-500 dark:text-slate-400">Version</dt>
          <dd>{info?.version ?? '…'}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Datenstand</dt>
          <dd>
            {formatDate(snapshotDate)}
            {newestFetch && <> (teilweise live aktualisiert am {formatDate(newestFetch)})</>}
          </dd>
        </dl>
        <button type="button" className="btn-primary" onClick={suggest}>
          Alternative vorschlagen
        </button>
      </section>

      <section className="card space-y-2 text-sm text-slate-700 dark:text-slate-300">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Haftungshinweis</h2>
        <p>
          Die Angaben werden sorgfältig gepflegt, aber ohne Gewähr. Ob eine Alternative für dich passt, musst du selbst
          prüfen. Programme werden direkt von GitHub heruntergeladen und nie automatisch gestartet. Für Inhalt und
          Sicherheit der Programme sind deren Entwicklerinnen und Entwickler verantwortlich.
        </p>
        <p className="font-medium">Keine Verbindung zu den genannten Firmen. Produktnamen gehören den jeweiligen Inhabern.</p>
      </section>
    </div>
  );
}
