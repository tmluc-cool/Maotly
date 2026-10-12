import { useEffect, useRef } from 'react';
import { href, navigate } from '../lib/router';
import { useApp } from '../state';

/**
 * Asked once after the first start. Can only be closed with one of the two answers.
 * Both buttons look exactly the same – nothing is preselected.
 */
export function ConsentDialog() {
  const { network } = useApp();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const open = !!network?.askConsent && window.location.hash !== href.privacy();

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  if (!network) return null;
  const s = network.signIn;
  const answerButton = 'w-full rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-base font-semibold text-slate-900 transition hover:border-brand-500 hover:bg-brand-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700';

  return (
    <dialog
      ref={dialogRef}
      className="w-[min(40rem,calc(100vw-2rem))] rounded-2xl bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/60 dark:bg-slate-900 dark:text-slate-100"
      onCancel={(e) => e.preventDefault()} // Esc doesn't close it: an answer is needed
      aria-labelledby="consent-title"
    >
      <div className="space-y-4 p-7">
        {/* Focus starts on the title, so neither answer looks preselected. */}
        <h2 id="consent-title" className="text-2xl font-extrabold outline-none focus-visible:ring-0" tabIndex={-1} autoFocus>
          Willkommen bei GratisStatt!
        </h2>

        {s.state === 'waiting' ? (
          <div className="space-y-4">
            <p>1. Öffne GitHub und gib diesen Code ein:</p>
            <p className="select-all rounded-xl bg-slate-100 py-4 text-center font-mono text-3xl font-bold tracking-widest dark:bg-slate-800">
              {s.info.userCode}
            </p>
            <button type="button" className={answerButton} onClick={() => void window.api.openExternal(s.info.verificationUri)}>
              GitHub öffnen
            </button>
            <p className="text-sm text-slate-600 dark:text-slate-400">2. Bestätige dort die Anmeldung. Diese Seite merkt es automatisch …</p>
            <button type="button" className="text-sm underline" onClick={() => void window.api.cancelJoin()}>
              Abbrechen (dann gilt «Nein danke»)
            </button>
          </div>
        ) : s.state === 'registering' ? (
          <p>Anmeldung bestätigt. Einen Moment …</p>
        ) : (
          <>
            <p>Die App funktioniert komplett ohne Anmeldung.</p>
            <p>
              Wenn du willst, kannst du beim <strong>GratisStatt-Netzwerk</strong> mitmachen. Projekte, die du über die
              Live-Suche findest, landen dann nach einer Prüfung beim nächsten Update bei allen Nutzern. Ausserdem kannst du
              Projekte bewerten und hilfreiche Bewertungen hochwählen.
            </p>
            <p>
              <strong>Gespeichert wird:</strong> dein GitHub-Benutzername, die App-Version, an welchem Tag du die App zuletzt
              benutzt hast, wie viele Projekte du beigetragen hast, deine Bewertungen und welche Bewertungen du hochgewählt hast.
              <br />
              <strong>Öffentlich sichtbar:</strong> deine Bewertungen mit deinem GitHub-Benutzernamen. Bei Upvotes nur die Anzahl,
              nicht wer gewählt hat.
              <br />
              <strong>Nicht gespeichert wird:</strong> E-Mail, IP-Adresse, Suchbegriffe, Dateien auf deinem Computer.
            </p>
            <p>Du kannst das jederzeit in den Einstellungen ändern und deine Daten löschen.</p>
            {s.state === 'error' && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/50 dark:text-rose-200">{s.message}</p>
            )}
            <div className="grid gap-3 pt-2 sm:grid-cols-2">
              <button type="button" className={answerButton} onClick={() => void window.api.joinNetwork()}>
                Mitmachen – mit GitHub anmelden
              </button>
              <button
                type="button"
                className={answerButton}
                onClick={() => void (s.state === 'error' ? window.api.cancelJoin() : window.api.declineNetwork())}
              >
                Nein danke, nur lokal
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <button type="button" className="underline" onClick={() => navigate(href.privacy())}>
                Datenschutzerklärung lesen
              </button>
              <span className="text-xs text-slate-500 dark:text-slate-400">Ein Spass-Projekt – ohne Gewähr und ohne Haftung.</span>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
