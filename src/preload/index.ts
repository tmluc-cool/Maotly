import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type GratisStattApi } from '../shared/ipc';
import type { DownloadEvent } from '../shared/types';

const api: GratisStattApi = {
  getAllStats: () => ipcRenderer.invoke(IPC.statsGetAll),
  refreshRepos: (repos) => ipcRenderer.invoke(IPC.statsRefresh, repos),
  refreshAll: () => ipcRenderer.invoke(IPC.statsRefreshAll),
  clearCache: () => ipcRenderer.invoke(IPC.cacheClear),
  searchLive: (term) => ipcRenderer.invoke(IPC.searchLive, term),
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  setToken: (token) => ipcRenderer.invoke(IPC.tokenSet, token),
  clearToken: () => ipcRenderer.invoke(IPC.tokenClear),
  setTheme: (theme) => ipcRenderer.invoke(IPC.themeSet, theme),
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo),
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  startDownload: (repo, assetName) => ipcRenderer.invoke(IPC.downloadStart, repo, assetName),
  showDownload: (id) => ipcRenderer.invoke(IPC.downloadShow, id),
  onDownloadEvent: (listener) => {
    const handler = (_e: IpcRendererEvent, event: DownloadEvent) => listener(event);
    ipcRenderer.on(IPC.downloadEvent, handler);
    return () => ipcRenderer.removeListener(IPC.downloadEvent, handler);
  },
};

contextBridge.exposeInMainWorld('api', api);
