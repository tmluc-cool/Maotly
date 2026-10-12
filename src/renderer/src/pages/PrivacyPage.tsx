import privacy from '../../../../docs/PRIVACY.md?raw';
import { Markdown } from '../components/Markdown';
import { ArrowLeftIcon } from '../components/icons';

export function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 pb-20 pt-8">
      <button type="button" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-600 hover:underline dark:text-slate-400" onClick={() => history.back()}>
        <ArrowLeftIcon /> Zurück
      </button>
      <div className="card">
        <Markdown source={privacy} />
      </div>
    </div>
  );
}
