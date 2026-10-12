import { app, BrowserWindow, ipcMain, nativeTheme, net, screen, session, shell } from 'electron';
import { join } from 'node:path';
import icon from '../../build/icon.png?asset';
import alternatives from '../../data/alternatives.json';
import { detectLang, isLang, setLang, t } from '../shared/i18n';
import { IPC } from '../shared/ipc';
import type { AlternativesData, AppUpdateInfo, SearchParams, SettingsState, ThemeSetting } from '../shared/types';
import { GitHubClient } from '../shared/crawler/client';
import { checkAppUpdate } from './app-update';
import { config, releasesApiUrl, signInConfigured, sponsorUrl } from './config';
import { AppDatabase } from './database';
import { liveSearch } from './live-search';
import { GitHubAccount } from './github-account';
import { adoptLegacyUserData } from './legacy';
import { Network } from './network';
import {
  accountSecrets,
  clearSecret,
  encryptionAvailable,
  getSecret,
  loadSettings,
  loadWindowState,
  networkSecrets,
  saveSettings,
  saveWindowState,
  setSecret,
  type Settings,
  type WindowState,
} from './store';
import { Updater } from './updater';

const MIN_WIDTH = 900;
const MIN_HEIGHT = 600;
const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let settings: Settings = { theme: 'system', autoUpdate: true };
let database: AppDatabase;
let updater: Updater;
let network: Network;
let account: GitHubAccount;
let appUpdate: AppUpdateInfo | null = null;

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

/** Only https://github.com/… and the website URLs of the curated list may be opened. */
const curatedWebsites = new Set(
  (alternatives as AlternativesData).products.flatMap((p) => p.alternatives.map((a) => a.website).filter((w): w is string => !!w)),
);

export function isAllowedExternal(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    if (u.hostname === 'github.com') return true;
    return curatedWebsites.has(url);
  } catch {
    return false;
  }
}

/** GitHub token for searches: "Sign in with GitHub", else an own token from the settings, else none. */
function githubToken(): string | null {
  return account.token() ?? getSecret('own-github');
}

function send(channel: string, value?: unknown) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, value);
}

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
    title: 'Moatly',
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#020617' : '#f8fafc',
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
  mainWindow.on('close', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const maximized = mainWindow.isMaximized();
    const b = maximized ? mainWindow.getNormalBounds() : mainWindow.getBounds();
    saveWindowState({ width: b.width, height: b.height, x: b.x, y: b.y, maximized });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternal(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL() ?? '';
    if (url.split('#')[0] !== current.split('#')[0]) event.preventDefault();
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
}

/** Language: chosen in the settings, else the system language (English if not German or Spanish). */
function applyLanguage() {
  setLang(settings.language ?? detectLang(app.getPreferredSystemLanguages()));
}

function settingsState(): SettingsState {
  return {
    theme: settings.theme,
    language: settings.language ?? detectLang(app.getPreferredSystemLanguages()),
    autoUpdate: settings.autoUpdate,
    hasOwnToken: !!getSecret('own-github'),
    encryptionAvailable: encryptionAvailable(),
  };
}

function sanitizeSearch(p: unknown): SearchParams {
  const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 200) : undefined);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  return {
    q: str(o.q) ?? '',
    anyOf: Array.isArray(o.anyOf) ? o.anyOf.filter((x): x is string => typeof x === 'string').slice(0, 20).map((x) => x.slice(0, 60)) : undefined,
    excludeIds: Array.isArray(o.excludeIds) ? o.excludeIds.filter((x): x is number => Number.isInteger(x)).slice(0, 100) : undefined,
    category: str(o.category) ?? null,
    platform: (str(o.platform) as SearchParams['platform']) ?? null,
    minStars: num(o.minStars),
    updatedWithin: str(o.updatedWithin) as SearchParams['updatedWithin'],
    licensed: o.licensed === true,
    activeOnly: o.activeOnly === true,
    sort: str(o.sort) as SearchParams['sort'],
    offset: num(o.offset),
    limit: num(o.limit),
  };
}

function registerIpc() {
  ipcMain.handle(IPC.search, (_e, p) => database.search(sanitizeSearch(p)));
  ipcMain.handle(IPC.curated, (_e, repos: unknown) =>
    database.curated(Array.isArray(repos) ? repos.filter((r): r is string => typeof r === 'string').slice(0, 50) : []),
  );
  ipcMain.handle(IPC.newly, () => database.newlyDiscovered(12));
  ipcMain.handle(IPC.stats, () => database.stats());
  const id = (v: unknown) => (Number.isSafeInteger(v) && (v as number) > 0 ? (v as number) : null);
  const bad = () => ({ ok: false, message: t('main.invalidInput') }) as const;
  ipcMain.handle(IPC.repoDetails, (_e, repoId: unknown) => {
    const rid = id(repoId);
    return rid ? database.repoDetails(rid) : { repo: null, reviews: [], summary: { avg: 0, count: 0, distribution: [0, 0, 0, 0, 0] } };
  });
  ipcMain.handle(IPC.reviewWrite, (_e, repoId: unknown, rating: unknown, text: unknown) => {
    const rid = id(repoId);
    if (!rid || !Number.isInteger(rating) || (rating as number) < 1 || (rating as number) > 5 || typeof text !== 'string') return bad();
    const trimmed = text.trim();
    if (trimmed.length < 3 || trimmed.length > 500) return { ok: false, message: t('main.textLength') };
    return network.writeReview(rid, rating as number, trimmed);
  });
  ipcMain.handle(IPC.reviewDelete, (_e, repoId: unknown) => (id(repoId) ? network.deleteReview(id(repoId)!) : bad()));
  ipcMain.handle(IPC.reviewVote, (_e, reviewId: unknown, on: unknown) => (id(reviewId) ? network.vote(id(reviewId)!, on === true) : bad()));
  ipcMain.handle(IPC.reviewReply, (_e, reviewId: unknown, text: unknown) => {
    if (!id(reviewId) || typeof text !== 'string') return bad();
    const trimmed = text.trim();
    if (trimmed.length < 3 || trimmed.length > 500) return { ok: false, message: t('main.replyLength') };
    return network.reply(id(reviewId)!, trimmed);
  });
  ipcMain.handle(IPC.reviewDeleteReply, (_e, reviewId: unknown) => (id(reviewId) ? network.deleteReply(id(reviewId)!) : bad()));
  ipcMain.handle(IPC.vacuum, () => updater.vacuum());

  ipcMain.handle(IPC.liveSearch, async (_e, term: unknown) => {
    const res = await liveSearch(database, typeof term === 'string' ? term : '', {
      token: githubToken(),
      networkOn: network.isMember(),
      fetch: (input, init) => net.fetch(input as string, init),
    });
    if (res.ok) void network.flushSubmissions();
    return res;
  });

  ipcMain.handle(IPC.updateStatus, () => updater.status);
  ipcMain.handle(IPC.updateNow, () => updater.manualUpdate());
  ipcMain.handle(IPC.updatePause, () => updater.pause(true));

  ipcMain.handle(IPC.settingsGet, () => settingsState());
  ipcMain.handle(IPC.themeSet, (_e, theme: unknown) => {
    if (theme !== 'system' && theme !== 'light' && theme !== 'dark') return;
    settings = { ...settings, theme };
    saveSettings(settings);
    nativeTheme.themeSource = theme;
  });
  ipcMain.handle(IPC.languageSet, (_e, lang: unknown) => {
    if (!isLang(lang)) return;
    settings = { ...settings, language: lang };
    saveSettings(settings);
    applyLanguage();
  });
  ipcMain.handle(IPC.autoUpdateSet, (_e, on: unknown) => {
    settings = { ...settings, autoUpdate: on === true };
    saveSettings(settings);
    if (settings.autoUpdate) updater.checkSchedule();
  });
  ipcMain.handle(IPC.tokenSet, async (_e, token: unknown) => {
    const value = typeof token === 'string' ? token.trim() : '';
    if (!/^[A-Za-z0-9_]{20,255}$/.test(value)) return { ok: false, message: t('main.tokenFormat') };
    if (!encryptionAvailable()) return { ok: false, message: t('main.tokenNoEncryption') };
    try {
      const client = new GitHubClient({ token: value, maxRetries: 0, fetch: (i, init) => net.fetch(i as string, init) });
      await client.getRepo('octocat/Hello-World');
    } catch (err) {
      const status = (err as { status?: number }).status;
      return { ok: false, message: t(status === 401 ? 'main.tokenInvalid' : 'main.githubUnreachable') };
    }
    setSecret('own-github', value);
    return { ok: true };
  });
  ipcMain.handle(IPC.tokenClear, () => {
    clearSecret('own-github');
    return settingsState();
  });

  ipcMain.handle(IPC.githubGet, () => account.state());
  ipcMain.handle(IPC.githubSignIn, () => {
    if (account.available()) account.signIn().catch(() => undefined); // the state shows the result
  });
  ipcMain.handle(IPC.githubCancel, () => account.cancel());
  ipcMain.handle(IPC.githubSignOut, () => {
    // Members need the sign-in (replies as owner); they leave the network first.
    if (!network.isMember()) account.signOut();
  });

  ipcMain.handle(IPC.networkGet, () => network.state());
  ipcMain.handle(IPC.networkAsk, () => network.showConsentAgain());
  ipcMain.handle(IPC.networkDecline, () => network.decline());
  ipcMain.handle(IPC.networkJoin, () => void network.join());
  ipcMain.handle(IPC.networkCancelJoin, () => network.cancelJoin());
  ipcMain.handle(IPC.networkLeave, () => network.leave());
  ipcMain.handle(IPC.networkMyData, () => network.myData());

  ipcMain.handle(IPC.appInfo, () => ({
    version: app.getVersion(),
    platform: process.platform,
    projectRepoUrl: `https://github.com/${config.projectRepo}`,
    sponsorUrl: sponsorUrl(),
    isDev,
  }));
  ipcMain.handle(IPC.appUpdate, () => appUpdate);
  ipcMain.handle(IPC.openExternal, async (_e, url: unknown) => {
    if (isAllowedExternal(url)) await shell.openExternal(url);
  });

  // Testing helpers, only in development.
  ipcMain.handle(IPC.devResetCheck, () => {
    if (isDev) updater.resetLastCheck();
  });
  ipcMain.handle(IPC.devShowConsent, () => {
    if (isDev) network.showConsentAgain();
  });
}

function bundledBasePath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'base.db') : join(app.getAppPath(), 'resources', 'base.db');
}

app.whenReady().then(() => {
  app.setAppUserModelId('ch.gratisstatt.app'); // same ID as the installer (kept from the first name)
  adoptLegacyUserData(app.getPath('userData'), join(app.getPath('appData'), 'GratisStatt'));
  settings = loadSettings();
  nativeTheme.themeSource = settings.theme;
  applyLanguage();

  const opened = AppDatabase.open(app.getPath('userData'), bundledBasePath());
  database = opened.db;

  account = new GitHubAccount({
    secrets: accountSecrets,
    store: database,
    fetch: (input, init) => net.fetch(input as string, init),
    clientId: () => (signInConfigured() ? config.oauthClientId : null),
    canStore: encryptionAvailable,
  });
  account.on('state', (s) => send(IPC.githubEvent, s));

  network = new Network({
    db: database,
    secrets: networkSecrets,
    account,
    fetch: (input, init) => net.fetch(input as string, init),
    appVersion: app.getVersion(),
  });
  network.on('state', (s) => send(IPC.networkEvent, s));

  updater = new Updater(database, { getToken: githubToken, autoUpdate: () => settings.autoUpdate });
  updater.on('status', (s) => send(IPC.updateEvent, s));
  updater.on('changed', () => send(IPC.dataChanged));
  if (opened.baseToMerge) updater.mergeBase(opened.baseToMerge.file, opened.baseToMerge.version);

  if (!isDev || !process.env.ELECTRON_RENDERER_URL) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [PROD_CSP] } });
    });
  }
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  registerIpc();
  createWindow();
  updater.start();

  // New app version? Once at start and then once a day (anonymous, only GitHub).
  if (!isDev) {
    const checkApp = async () => {
      appUpdate = await checkAppUpdate((i, init) => net.fetch(i as string, init), releasesApiUrl(), app.getVersion());
      send(IPC.appUpdateEvent, appUpdate);
    };
    setTimeout(() => void checkApp(), 10_000);
    setInterval(() => void checkApp(), 24 * 60 * 60 * 1000);
  }

  // Network: heartbeat once a day, submissions at most once an hour (only for members).
  void network.heartbeat();
  setInterval(() => {
    void network.heartbeat();
    void network.flushSubmissions();
  }, 15 * 60 * 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

let quitting = false;
app.on('before-quit', (event) => {
  if (quitting || !updater) return;
  // Pause a running manual update so it can continue after the next start.
  event.preventDefault();
  quitting = true;
  void updater.stop().finally(() => {
    database.close();
    app.quit();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
