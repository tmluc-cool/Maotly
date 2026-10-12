import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type GratisStattApi } from '../shared/ipc';

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_e: IpcRendererEvent, value: T) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: GratisStattApi = {
  search: (params) => ipcRenderer.invoke(IPC.search, params),
  curated: (repos) => ipcRenderer.invoke(IPC.curated, repos),
  newlyDiscovered: () => ipcRenderer.invoke(IPC.newly),
  stats: () => ipcRenderer.invoke(IPC.stats),
  vacuum: () => ipcRenderer.invoke(IPC.vacuum),
  liveSearch: (term) => ipcRenderer.invoke(IPC.liveSearch, term),

  updateStatus: () => ipcRenderer.invoke(IPC.updateStatus),
  updateNow: () => ipcRenderer.invoke(IPC.updateNow),
  updatePause: () => ipcRenderer.invoke(IPC.updatePause),
  onUpdateStatus: (l) => subscribe(IPC.updateEvent, l),
  onDataChanged: (l) => subscribe(IPC.dataChanged, () => l()),

  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  setTheme: (theme) => ipcRenderer.invoke(IPC.themeSet, theme),
  setAutoUpdate: (on) => ipcRenderer.invoke(IPC.autoUpdateSet, on),
  setToken: (token) => ipcRenderer.invoke(IPC.tokenSet, token),
  clearToken: () => ipcRenderer.invoke(IPC.tokenClear),

  networkState: () => ipcRenderer.invoke(IPC.networkGet),
  onNetworkState: (l) => subscribe(IPC.networkEvent, l),
  askNetwork: () => ipcRenderer.invoke(IPC.networkAsk),
  declineNetwork: () => ipcRenderer.invoke(IPC.networkDecline),
  joinNetwork: () => ipcRenderer.invoke(IPC.networkJoin),
  cancelJoin: () => ipcRenderer.invoke(IPC.networkCancelJoin),
  leaveNetwork: () => ipcRenderer.invoke(IPC.networkLeave),
  myData: () => ipcRenderer.invoke(IPC.networkMyData),

  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo),
  appUpdate: () => ipcRenderer.invoke(IPC.appUpdate),
  onAppUpdate: (l) => subscribe(IPC.appUpdateEvent, l),
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  devResetCheck: () => ipcRenderer.invoke(IPC.devResetCheck),
  devShowConsent: () => ipcRenderer.invoke(IPC.devShowConsent),
};

contextBridge.exposeInMainWorld('api', api);
