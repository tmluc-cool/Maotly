import privacyDe from '../../../../docs/PRIVACY.de.md?raw';
import privacyEn from '../../../../docs/PRIVACY.md?raw';
import privacyEs from '../../../../docs/PRIVACY.es.md?raw';
import type { Lang } from '@shared/types';
import { Markdown } from '../components/Markdown';
import { ArrowLeftIcon } from '../components/icons';
import { getLang, t } from '../lib/i18n';

const PRIVACY: Record<Lang, string> = { en: privacyEn, de: privacyDe, es: privacyEs };

export function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 pb-20 pt-8">
      <button type="button" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-600 hover:underline dark:text-slate-400" onClick={() => history.back()}>
        <ArrowLeftIcon /> {t('common.back')}
      </button>
      <div className="card">
        <Markdown source={PRIVACY[getLang()]} />
      </div>
    </div>
  );
}
