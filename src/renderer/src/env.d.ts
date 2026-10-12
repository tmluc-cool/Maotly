import type { GratisStattApi } from '@shared/ipc';

declare global {
  interface Window {
    api: GratisStattApi;
  }
}

export {};
