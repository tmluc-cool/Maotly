
import { formatNumber, getLang, locale, t, type Lang } from '@shared/i18n';

export type Maintenance = 'green' | 'yellow' | 'red' | 'unknown';

const DAY = 24 * 60 * 60 * 1000;

export function formatStars(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k < 100 ? (Math.floor(k * 10) / 10).toString() : Math.floor(k)}k`;
  }
  return `${(Math.floor(n / 100_000) / 10).toString()}M`;
}

/** Whole calendar months between two dates (never negative). */
export function monthsBetween(from: Date, to: Date): number {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months--;
  return Math.max(0, months);
}

/** "today", "yesterday", "5 days ago", "3 months ago", "2 years ago" in the current language. */
export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return t('common.unknown');
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return t('common.unknown');
  const days = Math.max(0, Math.floor((now - time) / DAY));
  const months = monthsBetween(new Date(time), new Date(now));
  // "auto" only for today/yesterday; "1 month ago" reads better than "last month" here.
  if (days <= 1) return new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' }).format(-days, 'day');
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'always' });
  if (months < 1) return rtf.format(-days, 'day');
  if (months < 12) return rtf.format(-months, 'month');
  return rtf.format(-Math.floor(months / 12), 'year');
}

/** Traffic light: green < 6 months, yellow < 18 months, red older or archived. */
export function maintenance(repo: { pushed_at: string | null; archived: number | boolean } | undefined, now: number = Date.now()): Maintenance {
  if (!repo) return 'unknown';
  if (repo.archived) return 'red';
  if (!repo.pushed_at) return 'unknown';
  const t = Date.parse(repo.pushed_at);
  if (Number.isNaN(t)) return 'unknown';
  const months = monthsBetween(new Date(t), new Date(now));
  if (months < 6) return 'green';
  if (months < 18) return 'yellow';
  return 'red';
}

// German: 12.10.2026, English: Oct 12, 2026, Spanish: 12 oct 2026.
const DATE_STYLE: Record<Lang, Intl.DateTimeFormatOptions> = {
  de: { day: '2-digit', month: '2-digit', year: 'numeric' },
  en: { day: 'numeric', month: 'short', year: 'numeric' },
  es: { day: 'numeric', month: 'short', year: 'numeric' },
};

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return t('common.unknown');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t('common.unknown');
  // A plain day ("2026-10-12") means that day everywhere, not midnight UTC in the local time zone.
  const timeZone = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? 'UTC' : undefined;
  return d.toLocaleDateString(locale(), { ...DATE_STYLE[getLang()], timeZone });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return t('common.unknown');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t('common.unknown');
  return d.toLocaleString(locale(), { ...DATE_STYLE[getLang()], hour: '2-digit', minute: '2-digit' });
}

export function formatBytes(bytes: number): string {
  const fixed = (n: number, digits: number) => n.toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${fixed(bytes / (1024 * 1024), 1)} MB`;
  return `${fixed(bytes / (1024 * 1024 * 1024), 2)} GB`;
}

const NAME_OVERRIDES: Record<string, string> = {
  'LibreOffice/core': 'LibreOffice',
  'ONLYOFFICE/DesktopEditors': 'ONLYOFFICE',
  'jgraph/drawio-desktop': 'draw.io',
  'GNOME/gimp': 'GIMP',
  'obsproject/obs-studio': 'OBS Studio',
  'LMMS/lmms': 'LMMS',
  'AppFlowy-IO/AppFlowy': 'AppFlowy',
  'toeverything/AFFiNE': 'AFFiNE',
  'anyproto/anytype-ts': 'Anytype',
  'nextcloud/server': 'Nextcloud',
  'bitwarden/clients': 'Bitwarden',
  'keepassxreboot/keepassxc': 'KeePassXC',
  'n8n-io/n8n': 'n8n',
  'nocodb/nocodb': 'NocoDB',
  'calcom/cal.diy': 'Cal.com',
  'gitroomhq/postiz-app': 'Postiz',
  'open-webui/open-webui': 'Open WebUI',
  'ggml-org/whisper.cpp': 'whisper.cpp',
  'firefly-iii/firefly-iii': 'Firefly III',
  'Gnucash/gnucash': 'GnuCash',
  'espocrm/espocrm': 'EspoCRM',
  'woocommerce/woocommerce': 'WooCommerce',
  'PrestaShop/PrestaShop': 'PrestaShop',
  'WordPress/WordPress': 'WordPress',
  'FreshRSS/FreshRSS': 'FreshRSS',
  'Cisco-Talos/clamav': 'ClamAV',
  'ChrisTitusTech/winutil': 'WinUtil',
  'moonlight-stream/moonlight-qt': 'Moonlight',
  'OpenShot/openshot-qt': 'OpenShot',
  'mltframework/shotcut': 'Shotcut',
  'Stirling-Tools/Stirling-PDF': 'Stirling PDF',
  'sumatrapdfreader/sumatrapdf': 'SumatraPDF',
  'pdfarranger/pdfarranger': 'PDF Arranger',
  'languagetool-org/languagetool': 'LanguageTool',
  'wg-easy/wg-easy': 'WireGuard Easy',
  'ShareX/ShareX': 'ShareX',
  'TryGhost/Ghost': 'Ghost',
  'qgis/QGIS': 'QGIS',
  'FreeCAD/FreeCAD': 'FreeCAD',
  'LibreCAD/LibreCAD': 'LibreCAD',
  'Comfy-Org/ComfyUI': 'ComfyUI',
  'super-productivity/super-productivity': 'Super Productivity',
  'dani-garcia/vaultwarden': 'Vaultwarden',
  'invoiceninja/invoiceninja': 'Invoice Ninja',
  'activepieces/activepieces': 'Activepieces',
};

const GENERIC = new Set(['core', 'server', 'clients', 'client', 'app', 'desktop', 'web']);

/** Nice display name from "owner/name", e.g. "flameshot-org/flameshot" → "Flameshot". */
export function prettyRepoName(repo: string): string {
  if (NAME_OVERRIDES[repo]) return NAME_OVERRIDES[repo];
  const [owner, rawName = owner] = repo.split('/');
  let name = GENERIC.has(rawName.toLowerCase()) ? owner : rawName;
  name = name.replace(/[-_](desktop|qt|ts|app|gtk)$/i, '');
  return name
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => (w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** Whole number in the current language: 104,213 / 104'213 / 104.213. */
export function formatCount(n: number): string {
  return formatNumber(n);
}

/** Badge "Neu": first seen in the last 7 days, and not just part of the base database. */
export function isNew(repo: { first_seen_at: string; source: string }, now: number = Date.now()): boolean {
  if (repo.source === 'base') return false;
  const t = Date.parse(repo.first_seen_at);
  return !Number.isNaN(t) && now - t < 7 * DAY;
}
