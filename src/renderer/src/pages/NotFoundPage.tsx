import { href } from '../lib/router';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl px-6 py-24 text-center">
      <h1 className="text-2xl font-bold">Diese Seite gibt es nicht</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">Vielleicht wurde der Eintrag umbenannt.</p>
      <a href={href.home()} className="btn-primary mt-6 inline-flex">
        Zur Startseite
      </a>
    </div>
  );
}
