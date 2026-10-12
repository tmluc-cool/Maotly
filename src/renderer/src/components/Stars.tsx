import { useState } from 'react';
import { formatDecimal, t, tn } from '../lib/i18n';

function Star({ fill, size }: { fill: number; size: number }) {
  // fill: 0..1 (partially filled for averages like 4.3)
  const id = `star-${Math.round(fill * 100)}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id={id}>
          <stop offset={`${fill * 100}%`} stopColor="#f59e0b" />
          <stop offset={`${fill * 100}%`} stopColor="currentColor" stopOpacity="0.25" />
        </linearGradient>
      </defs>
      <path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17.1 6.1 20.3l1.3-6.5L2.5 9.3l6.6-.8z" fill={`url(#${id})`} />
    </svg>
  );
}

/** Read-only stars, e.g. 4.3 of 5. */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex text-slate-400" role="img" aria-label={t('stars.aria', { value: formatDecimal(value) })}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} fill={Math.max(0, Math.min(1, value - (i - 1)))} />
      ))}
    </span>
  );
}

const label = (stars: number) => (stars >= 1 && stars <= 5 ? t(`stars.label${stars as 1 | 2 | 3 | 4 | 5}`) : '');

/** Clickable 1–5 stars for writing a review (keyboard: arrow keys). */
export function StarInput({ value, onChange }: { value: number; onChange(v: number): void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-3">
      <div role="radiogroup" aria-label={t('stars.group')} className="flex text-slate-400" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i}
            aria-label={tn('stars.n', i)}
            className="rounded p-0.5"
            onMouseEnter={() => setHover(i)}
            onClick={() => onChange(i)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') onChange(Math.min(5, (value || 0) + 1));
              if (e.key === 'ArrowLeft') onChange(Math.max(1, (value || 2) - 1));
            }}
          >
            <Star size={30} fill={i <= shown ? 1 : 0} />
          </button>
        ))}
      </div>
      <span className="text-sm text-slate-600 dark:text-slate-400">{label(shown)}</span>
    </div>
  );
}

/** Compact "★ 4.3 (12)" chip. */
export function RatingChip({ avg, count }: { avg: number | null; count: number }) {
  if (!count || avg === null) return <span className="text-slate-500 dark:text-slate-400">{t('stars.none')}</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <Stars value={avg} size={13} />
      <span className="font-semibold text-slate-800 dark:text-slate-200">{formatDecimal(avg)}</span>
      <span>({count})</span>
    </span>
  );
}
