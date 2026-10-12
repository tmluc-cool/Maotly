import type { Level, Platform } from '@shared/types';
import { PlatformGlyph } from './icons';
import type { Maintenance } from '../lib/format';
import { t } from '../lib/i18n';

export const platformLabel = (p: Platform) => t(`platform.${p}`);
const platformHelp = (p: Platform) => t(`platformHelp.${p}`);
export const levelLabel = (l: Level) => t(`level.${l}`);
const levelHelp = (l: Level) => t(`levelHelp.${l}`);

const LEVEL_STYLE: Record<Level, string> = {
  einfach: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
  mittel: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  profi: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200',
};

export function LevelBadge({ level }: { level: Level }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${LEVEL_STYLE[level]}`}
      title={levelHelp(level)}
    >
      {levelLabel(level)}
    </span>
  );
}

export function PlatformList({ platforms }: { platforms: Platform[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={t('platforms.aria')}>
      {platforms.map((p) => (
        <li
          key={p}
          title={platformHelp(p)}
          className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          <PlatformGlyph platform={p} width={13} height={13} />
          {platformLabel(p)}
        </li>
      ))}
    </ul>
  );
}

const LIGHT_STYLE: Record<Maintenance, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-400',
  red: 'bg-rose-500',
  unknown: 'bg-slate-300 dark:bg-slate-600',
};

const lightHelp = (m: Maintenance) => t(`light.${m}`);

export function MaintenanceLight({ value }: { value: Maintenance }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${LIGHT_STYLE[value]}`}
      title={lightHelp(value)}
      role="img"
      aria-label={lightHelp(value)}
    />
  );
}
