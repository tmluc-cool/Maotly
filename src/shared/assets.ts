import type { ReleaseAsset } from './types';

const INSTALLER_EXT = /\.(exe|msi)$/i;
const EXCLUDE = /(arm64|aarch64|\barm\b|debug|symbols|uninstall|\.sig$|source|src)/i;
const X64 = /(x64|x86[_-]64|amd64|win64)/i;
const X86_32 = /(i[36]86|ia32|32[-_ ]?bit|win32[-_.]x86|x86(?![_-]?64))/i;
const INSTALLER_WORD = /(setup|install)/i;
const PORTABLE = /portable/i;

function score(asset: ReleaseAsset): number {
  const name = asset.name;
  let s = 0;
  if (X64.test(name)) s += 4;
  else if (X86_32.test(name)) s -= 3;
  if (INSTALLER_WORD.test(name)) s += 2;
  if (/\.exe$/i.test(name)) s += 1;
  if (PORTABLE.test(name)) s -= 1;
  // Tiny .exe files are usually launchers/helpers, not real installers.
  if (asset.size > 0 && asset.size < 200 * 1024) s -= 5;
  return s;
}

/**
 * Picks the best Windows installer from a release: .exe or .msi,
 * preferring x64, never source archives or ARM builds.
 */
export function pickWindowsAsset(assets: ReleaseAsset[] | null | undefined): ReleaseAsset | null {
  if (!assets || assets.length === 0) return null;
  const candidates = assets.filter((a) => INSTALLER_EXT.test(a.name) && !EXCLUDE.test(a.name));
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestScore = score(best);
  for (const a of candidates.slice(1)) {
    const s = score(a);
    if (s > bestScore) {
      best = a;
      bestScore = s;
    }
  }
  return best;
}
