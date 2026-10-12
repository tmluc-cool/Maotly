import { CoffeeIcon } from '../components/icons';
import { formatDate } from '../lib/format';
import { t, tn } from '../lib/i18n';
import { href } from '../lib/router';
import { useApp } from '../state';

export function AboutPage() {
  const { info, stats } = useApp();

  const suggest = () => {
    if (!info) return;
    void window.api.openExternal(
      `${info.projectRepoUrl}/issues/new?title=${encodeURIComponent(t('about.issueTitle'))}&body=${encodeURIComponent(t('about.issueBody'))}`,
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 pb-20 pt-8">
      <h1 className="text-3xl font-extrabold tracking-tight">{t('about.title')}</h1>
      <section className="card space-y-3">
        <p>{t('about.intro')}</p>
        <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-1 text-sm">
          <dt className="text-slate-500 dark:text-slate-400">{t('about.version')}</dt>
          <dd>{info?.version ?? '…'}</dd>
          <dt className="text-slate-500 dark:text-slate-400">{t('about.baseVersion')}</dt>
          <dd>{formatDate(stats?.baseVersion)}</dd>
          <dt className="text-slate-500 dark:text-slate-400">{t('about.dataDate')}</dt>
          <dd>
            {formatDate(stats?.dataDate)}
            {stats && <> · {tn('common.projects', stats.count)}</>}
          </dd>
        </dl>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={suggest}>
            {t('about.suggest')}
          </button>
          <a className="btn-secondary" href={href.privacy()}>
            {t('common.privacy')}
          </a>
        </div>
      </section>
      <section className="card space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <CoffeeIcon className="text-amber-700 dark:text-amber-400" width={20} height={20} /> {t('sponsor.title')}
        </h2>
        <p className="text-sm text-slate-700 dark:text-slate-300">{t('sponsor.text')}</p>
        <button type="button" className="btn-secondary" disabled={!info} onClick={() => info && void window.api.openExternal(info.sponsorUrl)}>
          <CoffeeIcon className="text-amber-700 dark:text-amber-400" /> {t('sponsor.button')}
        </button>
      </section>
      <section className="card space-y-2 text-sm text-slate-700 dark:text-slate-300">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('about.disclaimerTitle')}</h2>
        <p className="rounded-lg bg-amber-50 px-3 py-2 font-medium text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
          {t('about.disclaimer')}
        </p>
        <p>{t('about.disclaimerMore')}</p>
        <p className="font-medium">{t('about.noAffiliation')}</p>
      </section>
    </div>
  );
}
