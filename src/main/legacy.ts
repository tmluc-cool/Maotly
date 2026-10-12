import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** Files of the first version (called GratisStatt) and their new names. */
const LEGACY_FILES: Record<string, string> = {
  'gratisstatt.db': 'moatly.db',
  'gratisstatt.db-wal': 'moatly.db-wal',
  'gratisstatt.db-shm': 'moatly.db-shm',
  'settings.json': 'settings.json',
  'window-state.json': 'window-state.json',
  'own-github.bin': 'own-github.bin',
  'network-github.bin': 'github.bin',
  'session.bin': 'session.bin',
};

/**
 * The app used to be called GratisStatt and kept its data in another folder.
 * Copies database, settings and encrypted tokens over once, so nothing is lost after the rename.
 */
export function adoptLegacyUserData(userDataDir: string, legacyDir: string): boolean {
  if (legacyDir === userDataDir || existsSync(join(userDataDir, 'moatly.db')) || !existsSync(join(legacyDir, 'gratisstatt.db'))) {
    return false;
  }
  mkdirSync(userDataDir, { recursive: true });
  for (const [from, to] of Object.entries(LEGACY_FILES)) {
    try {
      if (existsSync(join(legacyDir, from)) && !existsSync(join(userDataDir, to))) copyFileSync(join(legacyDir, from), join(userDataDir, to));
    } catch {
      /* not essential: the app starts with fresh data instead */
    }
  }
  return true;
}
