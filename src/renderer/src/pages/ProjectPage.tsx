import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RepoDetails, ReviewWithState } from '@shared/types';
import { MaintenanceLight } from '../components/badges';
import { CodeIcon, StarIcon } from '../components/icons';
import { updatedText } from '../components/RepoCard';
import { StarInput, Stars } from '../components/Stars';
import { formatDate, formatStars, maintenance } from '../lib/format';
import { formatDecimal, t, tn } from '../lib/i18n';
import { useApp } from '../state';
import { NotFoundPage } from './NotFoundPage';

const MAX_TEXT = 500;

function Message({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return <p className={`text-sm ${msg.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>{msg.text}</p>;
}

function Distribution({ summary }: { summary: RepoDetails['summary'] }) {
  return (
    <div className="space-y-1">
      {[5, 4, 3, 2, 1].map((star) => {
        const n = summary.distribution[star - 1];
        const pct = summary.count ? Math.round((n / summary.count) * 100) : 0;
        return (
          <div key={star} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <span className="w-20">{tn('stars.n', star)}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-8 text-right">{n}</span>
          </div>
        );
      })}
    </div>
  );
}

function ReviewForm({ repoId, own, onDone }: { repoId: number; own: ReviewWithState | undefined; onDone(): void }) {
  const [rating, setRating] = useState(own?.rating ?? 0);
  const [text, setText] = useState(own?.text ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async () => {
    if (!rating) return setMsg({ ok: false, text: t('review.chooseStars') });
    if (text.trim().length < 3) return setMsg({ ok: false, text: t('review.writeSomething') });
    setBusy(true);
    try {
      const r = await window.api.writeReview(repoId, rating, text);
      setMsg(r.ok ? { ok: true, text: t('review.thanks') } : { ok: false, text: r.message });
      if (r.ok) onDone();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(t('review.confirmDelete'))) return;
    setBusy(true);
    try {
      const r = await window.api.deleteReview(repoId);
      setMsg(r.ok ? { ok: true, text: t('review.deleted') } : { ok: false, text: r.message });
      if (r.ok) {
        setRating(0);
        setText('');
        onDone();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="card space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2 className="text-lg font-bold">{t(own ? 'review.editTitle' : 'review.writeTitle')}</h2>
      <StarInput value={rating} onChange={setRating} />
      <label className="block">
        <span className="text-sm text-slate-600 dark:text-slate-400">{t('review.textLabel')}</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
          rows={3}
          maxLength={MAX_TEXT}
          placeholder={t('review.placeholder')}
          className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
        />
        <span className="text-xs text-slate-500">{text.length} / {MAX_TEXT}</span>
      </label>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {t('review.publicHint')}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary" disabled={busy}>
          {t(busy ? 'review.sending' : own ? 'review.saveChange' : 'review.submit')}
        </button>
        {own && (
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => void remove()}>
            {t('common.delete')}
          </button>
        )}
      </div>
      <Message msg={msg} />
    </form>
  );
}

function ReviewItem({ r, me, canJoin, onChange }: { r: ReviewWithState; me: string | null; canJoin: boolean; onChange(): void }) {
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState(r.reply_text ?? '');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const own = !!me && r.author.toLowerCase() === me.toLowerCase();
  const ownReply = !!me && !!r.reply_author && r.reply_author.toLowerCase() === me.toLowerCase();

  const vote = async () => {
    if (!me)
      return setMsg({
        ok: false,
        text: t(canJoin ? 'review.needJoin' : 'review.voteNotAvailable'),
      });
    setBusy(true);
    try {
      const res = await window.api.voteReview(r.id, !r.voted);
      if (!res.ok) setMsg({ ok: false, text: res.message });
      onChange();
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async () => {
    setBusy(true);
    try {
      const res = await window.api.replyReview(r.id, replyText);
      if (res.ok) {
        setReplying(false);
        setMsg(null);
        onChange();
      } else setMsg({ ok: false, text: res.message });
    } finally {
      setBusy(false);
    }
  };

  const removeReply = async () => {
    if (!confirm(t('review.confirmDeleteReply'))) return;
    const res = await window.api.deleteReply(r.id);
    if (!res.ok) setMsg({ ok: false, text: res.message });
    onChange();
  };

  return (
    <li className="card flex gap-4">
      <div className="flex w-12 shrink-0 flex-col items-center">
        <button
          type="button"
          disabled={busy || own}
          onClick={() => void vote()}
          aria-pressed={r.voted}
          title={t(own ? 'review.cantVoteOwn' : r.voted ? 'review.unvote' : 'review.vote')}
          className={`grid h-9 w-9 place-items-center rounded-lg border text-lg transition ${
            r.voted
              ? 'border-brand-600 bg-brand-600 text-white'
              : 'border-slate-200 hover:border-brand-400 hover:text-brand-700 disabled:opacity-40 dark:border-slate-700'
          }`}
        >
          ▲
        </button>
        <span className="mt-1 text-sm font-semibold" aria-label={t('review.votes', { count: r.votes })}>
          {r.votes}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Stars value={r.rating} size={15} />
          <span className="font-semibold">@{r.author}</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {formatDate(r.updated_day ?? r.created_day)}
            {r.created_day && r.updated_day && r.updated_day !== r.created_day && ` ${t('review.edited')}`}
          </span>
          {r.local === 1 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {t('review.localOnly')}
            </span>
          )}
        </div>
        <p className="mt-2 whitespace-pre-line break-words text-slate-800 dark:text-slate-200">{r.text}</p>

        {r.reply_text && !replying && (
          <div className="mt-3 rounded-lg border-l-4 border-brand-500 bg-brand-50 px-3 py-2 dark:bg-brand-900/20">
            <p className="text-xs font-semibold text-brand-800 dark:text-brand-200">
              {t('review.replyFrom', { author: r.reply_author ?? '', date: formatDate(r.reply_day) })}
            </p>
            <p className="mt-1 whitespace-pre-line break-words text-sm text-slate-800 dark:text-slate-200">{r.reply_text}</p>
            {ownReply && (
              <div className="mt-1 flex gap-3 text-xs">
                <button type="button" className="underline" onClick={() => setReplying(true)}>
                  {t('common.edit')}
                </button>
                <button type="button" className="underline" onClick={() => void removeReply()}>
                  {t('common.delete')}
                </button>
              </div>
            )}
          </div>
        )}

        {me && !own && !r.reply_text && !replying && (
          <button type="button" className="mt-2 text-xs text-slate-500 underline hover:text-slate-800 dark:hover:text-slate-200" onClick={() => setReplying(true)}>
            {t('review.replyAsOwner')}
          </button>
        )}

        {replying && (
          <div className="mt-3 space-y-2">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value.slice(0, MAX_TEXT))}
              rows={2}
              maxLength={MAX_TEXT}
              placeholder={t('review.replyPlaceholder')}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
            <p className="text-xs text-slate-500">{t('review.replyHint')}</p>
            <div className="flex gap-2">
              <button type="button" className="btn-primary" disabled={busy || replyText.trim().length < 3} onClick={() => void sendReply()}>
                {t(busy ? 'common.checking' : 'review.sendReply')}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setReplying(false)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}
        <Message msg={msg} />
      </div>
    </li>
  );
}

export function ProjectPage({ id }: { id: number }) {
  const { network, dataVersion } = useApp();
  const [details, setDetails] = useState<RepoDetails | null>(null);
  const [sort, setSort] = useState<'top' | 'new'>('top');
  const me = network?.member?.login ?? null;

  const load = useCallback(() => void window.api.repoDetails(id).then(setDetails), [id]);
  useEffect(load, [load, dataVersion]);

  const reviews = useMemo(() => {
    const list = [...(details?.reviews ?? [])];
    if (sort === 'new') list.sort((a, b) => (b.updated_day ?? '').localeCompare(a.updated_day ?? '') || b.id - a.id);
    return list;
  }, [details, sort]);

  if (details && !details.repo) return <NotFoundPage />;
  if (!details?.repo) return null;
  const repo = details.repo;
  const { summary } = details;
  const own = me ? details.reviews.find((r) => r.author.toLowerCase() === me.toLowerCase()) : undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 pb-20 pt-8">
      <button type="button" className="text-sm text-slate-600 hover:underline dark:text-slate-400" onClick={() => history.back()}>
        ← {t('common.back')}
      </button>

      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold tracking-tight">{repo.name}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('common.byOwner', { owner: repo.owner })}</p>
          </div>
          <button type="button" className="btn-primary" onClick={() => void window.api.openExternal(repo.html_url)}>
            <CodeIcon /> {t('common.openOnGitHub')}
          </button>
        </div>
        {repo.description && <p className="mt-3 text-slate-700 dark:text-slate-300">{repo.description}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
          <span className="inline-flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-200">
            <StarIcon className="text-amber-500" width={14} height={14} /> {t('project.starsOnGitHub', { stars: formatStars(repo.stars) })}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MaintenanceLight value={maintenance(repo)} /> {updatedText(repo)}
          </span>
          {repo.license && <span>{t('common.license', { license: repo.license })}</span>}
          {repo.language && <span>{repo.language}</span>}
        </div>
      </section>

      <section className="card grid gap-6 sm:grid-cols-[auto,1fr]">
        <div className="text-center">
          <div className="text-5xl font-extrabold">{summary.count ? formatDecimal(summary.avg) : '–'}</div>
          <Stars value={summary.avg} size={20} />
          <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {tn('project.reviews', summary.count)}
          </div>
        </div>
        <Distribution summary={summary} />
      </section>

      {me ? (
        <ReviewForm key={own?.id ?? 'new'} repoId={repo.id} own={own} onDone={load} />
      ) : (
        <section className="card text-sm text-slate-700 dark:text-slate-300">
          <p className="font-semibold">{t('project.writeOwn')}</p>
          {network?.available ? (
            <>
              <p className="mt-1">{t('project.linkHint')}</p>
              <button type="button" className="btn-primary mt-3" onClick={() => void window.api.askNetwork()}>
                {t('project.link')}
              </button>
            </>
          ) : (
            <p className="mt-1">{t('project.notAvailable')}</p>
          )}
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold">{t('project.reviewsTitle')}</h2>
          {reviews.length > 1 && (
            <div className="flex gap-2" role="radiogroup" aria-label={t('project.sortAria')}>
              <button type="button" role="radio" aria-checked={sort === 'top'} aria-pressed={sort === 'top'} className="chip-toggle" onClick={() => setSort('top')}>
                {t('project.top')}
              </button>
              <button type="button" role="radio" aria-checked={sort === 'new'} aria-pressed={sort === 'new'} className="chip-toggle" onClick={() => setSort('new')}>
                {t('project.newest')}
              </button>
            </div>
          )}
        </div>
        {reviews.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-600 dark:border-slate-700 dark:text-slate-400">
            {t('project.noReviews')}
          </p>
        ) : (
          <ul className="space-y-3">
            {reviews.map((r) => (
              <ReviewItem key={r.id} r={r} me={me} canJoin={!!network?.available} onChange={load} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
