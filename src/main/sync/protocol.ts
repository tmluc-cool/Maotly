/** Messages between the main process and the sync worker. */

import type { ProgressPhase } from '../../shared/types';

export type JobKind = 'packages' | 'manual' | 'merge-base' | 'vacuum';

export type WorkerRequest =
  | { type: 'packages'; manifestUrl: string; maxMissing: number }
  | { type: 'manual'; manifestUrl: string; maxMissing: number; token: string | null; resumeRunId?: number }
  | { type: 'merge-base'; file: string; baseVersion: string }
  | { type: 'vacuum' }
  | { type: 'pause' };

export interface WorkerProgress {
  job: JobKind;
  phase: ProgressPhase;
  index?: number;
  of?: number;
  added: number;
  updated: number;
}

export type WorkerMessage =
  | { type: 'progress'; progress: WorkerProgress }
  | { type: 'done'; job: JobKind; added: number; updated: number; paused?: boolean }
  | { type: 'error'; job: JobKind; message: string; offline: boolean };
