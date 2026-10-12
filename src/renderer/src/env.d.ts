/// <reference types="vite/client" />
import type { MoatlyApi } from '@shared/ipc';

declare global {
  interface Window {
    api: MoatlyApi;
  }
}

export {};
