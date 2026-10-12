import type { RepoStats } from '@shared/types';

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

export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return 'unbekannt';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'unbekannt';
  const days = Math.floor((now - t) / DAY);
  if (days <= 0) return 'heute';
  if (days === 1) return 'gestern';
  const months = monthsBetween(new Date(t), new Date(now));
  if (months < 1) return `vor ${days} Tagen`;
  if (months === 1) return 'vor 1 Monat';
  if (months < 12) return `vor ${months} Monaten`;
  const years = Math.floor(months / 12);
  return years === 1 ? 'vor 1 Jahr' : `vor ${years} Jahren`;
}

/** Traffic light: green < 6 months, yellow < 18 months, red older or archived. */
export function maintenance(stats: RepoStats | undefined, now: number = Date.now()): Maintenance {
  if (!stats) return 'unknown';
  if (stats.archived) return 'red';
  if (!stats.pushedAt) return 'unknown';
  const t = Date.parse(stats.pushedAt);
  if (Number.isNaN(t)) return 'unknown';
  const months = monthsBetween(new Date(t), new Date(now));
  if (months < 6) return 'green';
  if (months < 18) return 'yellow';
  return 'red';
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'unbekannt';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unbekannt';
  return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return 'unbekannt';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unbekannt';
  return d.toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
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
