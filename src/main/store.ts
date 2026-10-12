import { app, safeStorage } from 'electron';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ThemeSetting } from '../shared/types';
import type { Secrets } from './network';

function userFile(name: string) {
  const dir = app.getPath('userData');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, name);
}

/** Writes atomically so a crash never leaves half a file behind. */
function writeText(name: string, data: string) {
  const file = userFile(name);
  writeFileSync(`${file}.tmp`, data, 'utf8');
  renameSync(`${file}.tmp`, file);
}

function readJson<T>(name: string, fallback: T): T {
  try {
    const file = userFile(name);
    return existsSync(file) ? { ...fallback, ...JSON.parse(readFileSync(file, 'utf8')) } : fallback;
  } catch {
    return fallback;
  }
}

// --- Settings ---------------------------------------------------------------

export interface Settings {
  theme: ThemeSetting;
  autoUpdate: boolean;
}

export function loadSettings(): Settings {
  const s = readJson<Settings>('settings.json', { theme: 'system', autoUpdate: true });
  if (!['system', 'light', 'dark'].includes(s.theme)) s.theme = 'system';
  s.autoUpdate = s.autoUpdate !== false;
  return s;
}

export function saveSettings(settings: Settings) {
  writeText('settings.json', JSON.stringify(settings, null, 2));
}

// --- Window state ------------------------------------------------------------

export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized?: boolean;
}

export function loadWindowState(): WindowState {
  return readJson<WindowState>('window-state.json', { width: 1200, height: 800 });
}

export function saveWindowState(state: WindowState) {
  try {
    writeText('window-state.json', JSON.stringify(state));
  } catch {
    /* not important enough to fail */
  }
}

// --- Secrets (encrypted with safeStorage, never plain text, never in the renderer) ----

type SecretName = 'own-github' | 'network-github' | 'session';
const cache = new Map<SecretName, string | null>();

export function encryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export function getSecret(name: SecretName): string | null {
  if (cache.has(name)) return cache.get(name)!;
  let value: string | null = null;
  try {
    const file = userFile(`${name}.bin`);
    if (existsSync(file) && safeStorage.isEncryptionAvailable()) value = safeStorage.decryptString(readFileSync(file));
  } catch {
    value = null;
  }
  cache.set(name, value);
  return value;
}

export function setSecret(name: SecretName, value: string) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Verschlüsselung ist auf diesem System nicht verfügbar.');
  writeFileSync(userFile(`${name}.bin`), safeStorage.encryptString(value));
  cache.set(name, value);
}

export function clearSecret(name: SecretName) {
  rmSync(userFile(`${name}.bin`), { force: true });
  cache.set(name, null);
}

export const networkSecrets: Secrets = {
  get: (n) => getSecret(n),
  set: (n, v) => setSecret(n, v),
  clear: (n) => clearSecret(n),
};
