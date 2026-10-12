import { app, safeStorage } from 'electron';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ThemeSetting } from '../shared/types';

function userFile(name: string) {
  const dir = app.getPath('userData');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, name);
}

/** Writes atomically so a crash never leaves half a file behind. */
export function writeText(name: string, data: string) {
  const file = userFile(name);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, data, 'utf8');
  renameSync(tmp, file);
}

export function readText(name: string): string | null {
  const file = userFile(name);
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

function readJson<T>(name: string, fallback: T): T {
  try {
    const raw = readText(name);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

// --- Settings ---------------------------------------------------------------

interface Settings {
  theme: ThemeSetting;
}

const SETTINGS_FILE = 'settings.json';

export function loadSettings(): Settings {
  const s = readJson<Settings>(SETTINGS_FILE, { theme: 'system' });
  if (!['system', 'light', 'dark'].includes(s.theme)) s.theme = 'system';
  return s;
}

export function saveSettings(settings: Settings) {
  writeText(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// --- Window state ------------------------------------------------------------

export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized?: boolean;
}

const WINDOW_FILE = 'window-state.json';

export function loadWindowState(): WindowState {
  return readJson<WindowState>(WINDOW_FILE, { width: 1200, height: 800 });
}

export function saveWindowState(state: WindowState) {
  try {
    writeText(WINDOW_FILE, JSON.stringify(state));
  } catch {
    /* not important enough to fail */
  }
}

// --- GitHub token (encrypted with safeStorage, never plain text) -------------

const TOKEN_FILE = 'github-token.bin';
let tokenCache: string | null | undefined;

export function tokenEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export function getToken(): string | null {
  if (tokenCache !== undefined) return tokenCache;
  tokenCache = null;
  try {
    const file = userFile(TOKEN_FILE);
    if (existsSync(file) && safeStorage.isEncryptionAvailable()) {
      tokenCache = safeStorage.decryptString(readFileSync(file));
    }
  } catch {
    tokenCache = null;
  }
  return tokenCache;
}

export function setToken(token: string) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Verschlüsselung ist auf diesem System nicht verfügbar.');
  }
  const file = userFile(TOKEN_FILE);
  writeFileSync(file, safeStorage.encryptString(token));
  tokenCache = token;
}

export function clearToken() {
  rmSync(userFile(TOKEN_FILE), { force: true });
  tokenCache = null;
}
