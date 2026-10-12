import type { Level, Platform } from '@shared/types';
import { PlatformGlyph } from './icons';
import type { Maintenance } from '../lib/format';

export const PLATFORM_LABEL: Record<Platform, string> = {
  windows: 'Windows',
  mac: 'Mac',
  linux: 'Linux',
  android: 'Android',
  ios: 'iOS',
  web: 'Web',
  server: 'Server',
};

export const PLATFORM_HELP: Record<Platform, string> = {
  windows: 'Läuft unter Windows',
  mac: 'Läuft auf dem Mac',
  linux: 'Läuft unter Linux',
  android: 'App für Android',
  ios: 'App für iPhone und iPad',
  web: 'Läuft im Browser',
  server: 'Zum Selbsthosten auf einem eigenen Server oder NAS',
};

export const LEVEL_LABEL: Record<Level, string> = {
  einfach: 'Einfach',
  mittel: 'Mittel',
  profi: 'Profi',
};

export const LEVEL_HELP: Record<Level, string> = {
  einfach: 'Normale App mit Installer',
  mittel: 'Braucht etwas Einrichtung, z.B. Docker auf einem NAS oder eine Browser-Erweiterung',
  profi: 'Kommandozeile oder eigener Server',
};

const LEVEL_STYLE: Record<Level, string> = {
  einfach: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
  mittel: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  profi: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200',
};

export function LevelBadge({ level }: { level: Level }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${LEVEL_STYLE[level]}`}
      title={LEVEL_HELP[level]}
    >
      {LEVEL_LABEL[level]}
    </span>
  );
}

export function PlatformList({ platforms }: { platforms: Platform[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Plattformen">
      {platforms.map((p) => (
        <li
          key={p}
          title={PLATFORM_HELP[p]}
          className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          <PlatformGlyph platform={p} width={13} height={13} />
          {PLATFORM_LABEL[p]}
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

const LIGHT_HELP: Record<Maintenance, string> = {
  green: 'Aktiv gepflegt (letzte Änderung vor weniger als 6 Monaten)',
  yellow: 'Wenig Aktivität (letzte Änderung vor 6 bis 18 Monaten)',
  red: 'Wird kaum oder nicht mehr gepflegt',
  unknown: 'Noch keine Daten – wird beim nächsten Online-Abruf ergänzt',
};

export function MaintenanceLight({ value }: { value: Maintenance }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${LIGHT_STYLE[value]}`}
      title={LIGHT_HELP[value]}
      role="img"
      aria-label={LIGHT_HELP[value]}
    />
  );
}
