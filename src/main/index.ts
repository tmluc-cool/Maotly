import { app, BrowserWindow, ipcMain, nativeTheme, net, screen, session, shell } from 'electron';
import { join } from 'node:path';
import snapshotJson from '../../data/repo-stats.snapshot.json';
import icon from '../../build/icon.png?asset';
import { IPC } from '../shared/ipc';
import type { Snapshot, ThemeSetting } from '../shared/types';
import { pickWindowsAsset } from '../shared/assets';
import { GitHubService } from './github';
import { downloadedPath, isAllowedDownloadUrl, startDownload } from './downloads';
import {
  clearToken,
  getToken,
  loadSettings,
  loadWindowState,
  readText,
  saveSettings,
  saveWindowState,
  setToken,
  tokenEncryptionAvailable,
  writeText,
  type WindowState,
} from './store';

const PROJECT_REPO_URL = 'https://github.com/tmluc-cool/githuub-appstore';
const CACHE_FILE = 'repo-cache.json';
const MIN_WIDTH = 900;
const MIN_HEIGHT = 600;

const isDev = !app.isPackaged && !!process.env.ELECTRON_RENDERER_URL;

let mainWindow: BrowserWindow | null = null;
let github: GitHubService;
let settings = { theme: 'system' as ThemeSetting };

const PROD_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

function isHttpsUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Puts the window back where it was, but only if that spot is still on a screen. */
function restoreBounds(state: WindowState): WindowState {
  const width = Math.max(MIN_WIDTH, state.width || 1200);
  const height = Math.max(MIN_HEIGHT, state.height || 800);
  if (state.x === undefined || state.y === undefined) return { width, height, maximized: state.maximized };
  const visible = screen.getAllDisplays().some(({ workArea: a }) => {
    return state.x! + 100 > a.x && state.x! < a.x + a.width - 100 && state.y! >= a.y - 10 && state.y! < a.y + a.height - 100;
  });
  return visible ? { width, height, x: state.x, y: state.y, maximized: state.maximized } : { width, height, maximized: state.maximized };
}

function createWindow() {
  const state = restoreBounds(loadWindowState());

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    title: 'GratisStatt',
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f172a' : '#f8fafc',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  if (state.maximized) mainWindow.maximize();
  mainWindow.once('ready-to-show', () => mainWindow?.show());

  const saveState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const maximized = mainWindow.isMaximized();
    const b = maximized ? mainWindow.getNormalBounds() : mainWindow.getBounds();
    saveWindowState({ width: b.width, height: b.height, x: b.x, y: b.y, maximized });
  };
  mainWindow.on('close', saveState);

  // No new windows, no navigation away from the app. https links open in the browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpsUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL() ?? '';
    if (url.split('#')[0] !== current.split('#')[0]) event.preventDefault();
  });

  if (isDev) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL!);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function applyTheme(theme: ThemeSetting) {
  nativeTheme.themeSource = theme;
}

function registerIpc() {
  ipcMain.handle(IPC.statsGetAll, () => github.getState());

  ipcMain.handle(IPC.statsRefresh, (_e, repos: unknown) => {
    const known = github.getState().repos;
    const list = Array.isArray(repos) ? repos.filter((r): r is string => typeof r === 'string' && r in known).slice(0, 20) : [];
    return github.refresh(list);
  });

  ipcMain.handle(IPC.statsRefreshAll, () => github.refreshAll());
  ipcMain.handle(IPC.cacheClear, () => github.clearCache());

  ipcMain.handle(IPC.searchLive, (_e, term: unknown) => github.searchLive(typeof term === 'string' ? term : ''));

  ipcMain.handle(IPC.settingsGet, async () => {
    await github.updateRateLimits();
    const limits = github.getRateLimits();
    return {
      hasToken: !!getToken(),
      tokenEncryptionAvailable: tokenEncryptionAvailable(),
      theme: settings.theme,
      rateLimit: limits.core,
      searchRateLimit: limits.search,
    };
  });

  ipcMain.handle(IPC.tokenSet, async (_e, token: unknown) => {
    const value = typeof token === 'string' ? token.trim() : '';
    if (!/^[A-Za-z0-9_]{20,255}$/.test(value)) {
      return { ok: false, message: 'Das sieht nicht wie ein GitHub-Token aus.' };
    }
    if (!tokenEncryptionAvailable()) {
      return { ok: false, message: 'Dein System kann den Token nicht sicher speichern.' };
    }
    const check = await github.checkToken(value);
    if (!check.ok) return check;
    setToken(value);
    await github.updateRateLimits();
    return { ok: true };
  });

  ipcMain.handle(IPC.tokenClear, async () => {
    clearToken();
    await github.updateRateLimits();
    const limits = github.getRateLimits();
    return {
      hasToken: false,
      tokenEncryptionAvailable: tokenEncryptionAvailable(),
      theme: settings.theme,
      rateLimit: limits.core,
      searchRateLimit: limits.search,
    };
  });

  ipcMain.handle(IPC.themeSet, (_e, theme: unknown) => {
    if (theme !== 'system' && theme !== 'light' && theme !== 'dark') return;
    settings = { ...settings, theme };
    saveSettings(settings);
    applyTheme(theme);
  });

  ipcMain.handle(IPC.appInfo, () => ({
    version: app.getVersion(),
    platform: process.platform,
    projectRepoUrl: PROJECT_REPO_URL,
  }));

  ipcMain.handle(IPC.openExternal, async (_e, url: unknown) => {
    if (isHttpsUrl(url)) await shell.openExternal(url);
  });

  // The renderer only names repo + asset; the URL comes from our own data.
  ipcMain.handle(IPC.downloadStart, (e, repo: unknown, assetName: unknown) => {
    if (typeof repo !== 'string' || typeof assetName !== 'string') return { ok: false, message: 'Ungültige Anfrage.' };
    const entry = github.getState().repos[repo];
    const asset = entry?.stats.latestRelease?.assets.find((a) => a.name === assetName);
    if (!asset || asset !== pickWindowsAsset(entry?.stats.latestRelease?.assets) || !isAllowedDownloadUrl(asset.url)) {
      return { ok: false, message: 'Diese Datei ist nicht bekannt.' };
    }
    return { ok: true, id: startDownload(asset, e.sender) };
  });

  ipcMain.handle(IPC.downloadShow, (_e, id: unknown) => {
    const path = typeof id === 'string' ? downloadedPath(id) : undefined;
    if (path) shell.showItemInFolder(path);
  });
}

app.whenReady().then(() => {
  app.setAppUserModelId('ch.gratisstatt.app');
  settings = loadSettings();
  applyTheme(settings.theme);

  github = new GitHubService({
    fetch: (input, init) => net.fetch(input as string, init),
    snapshot: snapshotJson as Snapshot,
    getToken,
    readCache: () => readText(CACHE_FILE),
    writeCache: (data) => writeText(CACHE_FILE, data),
    userAgent: `GratisStatt/${app.getVersion()}`,
  });

  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [PROD_CSP] } });
    });
  }
  // The renderer never needs camera, microphone, notifications etc.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
