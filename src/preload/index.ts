import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type MoatlyApi } from '../shared/ipc';

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_e: IpcRendererEvent, value: T) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: MoatlyApi = {
  search: (params) => ipcRenderer.invoke(IPC.search, params),
  curated: (repos) => ipcRenderer.invoke(IPC.curated, repos),
  newlyDiscovered: () => ipcRenderer.invoke(IPC.newly),
  stats: () => ipcRenderer.invoke(IPC.stats),
  repoDetails: (id) => ipcRenderer.invoke(IPC.repoDetails, id),
  writeReview: (repoId, rating, text) => ipcRenderer.invoke(IPC.reviewWrite, repoId, rating, text),
  deleteReview: (repoId) => ipcRenderer.invoke(IPC.reviewDelete, repoId),
  voteReview: (reviewId, on) => ipcRenderer.invoke(IPC.reviewVote, reviewId, on),
  replyReview: (reviewId, text) => ipcRenderer.invoke(IPC.reviewReply, reviewId, text),
  deleteReply: (reviewId) => ipcRenderer.invoke(IPC.reviewDeleteReply, reviewId),
  vacuum: () => ipcRenderer.invoke(IPC.vacuum),
  liveSearch: (term) => ipcRenderer.invoke(IPC.liveSearch, term),

  updateStatus: () => ipcRenderer.invoke(IPC.updateStatus),
  updateNow: () => ipcRenderer.invoke(IPC.updateNow),
  updatePause: () => ipcRenderer.invoke(IPC.updatePause),
  onUpdateStatus: (l) => subscribe(IPC.updateEvent, l),
  onDataChanged: (l) => subscribe(IPC.dataChanged, () => l()),

  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  setTheme: (theme) => ipcRenderer.invoke(IPC.themeSet, theme),
  setLanguage: (lang) => ipcRenderer.invoke(IPC.languageSet, lang),
  setAutoUpdate: (on) => ipcRenderer.invoke(IPC.autoUpdateSet, on),
  setToken: (token) => ipcRenderer.invoke(IPC.tokenSet, token),
  clearToken: () => ipcRenderer.invoke(IPC.tokenClear),

  githubState: () => ipcRenderer.invoke(IPC.githubGet),
  onGitHubState: (l) => subscribe(IPC.githubEvent, l),
  githubSignIn: () => ipcRenderer.invoke(IPC.githubSignIn),
  githubCancel: () => ipcRenderer.invoke(IPC.githubCancel),
  githubSignOut: () => ipcRenderer.invoke(IPC.githubSignOut),

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
  installAppUpdate: () => ipcRenderer.invoke(IPC.appUpdateInstall),
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  devResetCheck: () => ipcRenderer.invoke(IPC.devResetCheck),
  devShowConsent: () => ipcRenderer.invoke(IPC.devShowConsent),
};

contextBridge.exposeInMainWorld('api', api);
