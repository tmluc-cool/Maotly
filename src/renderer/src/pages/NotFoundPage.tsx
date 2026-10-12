import { t } from '../lib/i18n';
import { href } from '../lib/router';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl px-6 py-24 text-center">
      <h1 className="text-2xl font-bold">{t('notFound.title')}</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">{t('notFound.lead')}</p>
      <a href={href.home()} className="btn-primary mt-6 inline-flex">
        {t('notFound.home')}
      </a>
    </div>
  );
}
