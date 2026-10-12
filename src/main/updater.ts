import { EventEmitter } from 'node:events';
import { Worker } from 'node:worker_threads';
import workerPath from './sync-worker?modulePath';
import { config, manifestUrl } from './config';
import type { AppDatabase } from './database';
import type { WorkerMessage, WorkerRequest } from './sync/protocol';
import type { UpdateStatus } from '../shared/types';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Plans and runs updates in the sync worker:
 * checks at start and every hour whether the last check is older than 7 days.
 */
export class Updater extends EventEmitter {
  private worker: Worker;
  private timer: NodeJS.Timeout | null = null;
  private queue: WorkerRequest[] = [];
  private busy = false;
  status: UpdateStatus = { running: false, job: null, text: '', added: 0, updated: 0, paused: false, error: null, offline: false };

  constructor(
    private db: AppDatabase,
    private opts: { getToken: () => string | null; autoUpdate: () => boolean },
  ) {
    super();
    this.worker = new Worker(workerPath, { workerData: { dbPath: db.path } });
    this.worker.on('message', (m: WorkerMessage) => this.onMessage(m));
    this.worker.on('error', (err: Error) => {
      this.busy = false;
      this.set({ running: false, job: null, error: err.message });
    });
    this.status.paused = db.pausedManualRun() !== null;
  }

  start() {
    // A manual update that was interrupted by closing the app continues automatically.
    if (this.status.paused && this.db.getMeta('manual_paused_by_user') !== '1' && this.opts.autoUpdate()) {
      this.manualUpdate();
    } else {
      this.checkSchedule();
    }
    this.timer = setInterval(() => this.checkSchedule(), HOUR);
  }

  /** Runs the weekly package check if it is due. */
  checkSchedule(force = false) {
    if (!force && !this.opts.autoUpdate()) return;
    const last = Date.parse(this.db.getMeta('last_update_check') ?? '');
    if (!force && !Number.isNaN(last) && Date.now() - last < config.updateIntervalDays * DAY) return;
    this.enqueue({ type: 'packages', manifestUrl: manifestUrl(), maxMissing: config.maxMissingDeltas });
  }

  manualUpdate() {
    this.db.setMeta('manual_paused_by_user', null);
    this.enqueue({
      type: 'manual',
      manifestUrl: manifestUrl(),
      maxMissing: config.maxMissingDeltas,
      token: this.opts.getToken(),
      resumeRunId: this.db.pausedManualRun() ?? undefined,
    });
  }

  pause(byUser = true) {
    if (byUser) this.db.setMeta('manual_paused_by_user', '1');
    this.queue = this.queue.filter((r) => r.type !== 'manual');
    this.worker.postMessage({ type: 'pause' } satisfies WorkerRequest);
  }

  mergeBase(file: string, version: string) {
    this.enqueue({ type: 'merge-base', file, baseVersion: version });
  }

  vacuum() {
    this.enqueue({ type: 'vacuum' });
  }

  /** Dev helper: make the next check think the last one was 8 days ago. */
  resetLastCheck() {
    this.db.setMeta('last_update_check', new Date(Date.now() - 8 * DAY).toISOString());
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.busy && this.status.job === 'manual') {
      this.pause(false);
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 3000);
        this.once('idle', () => {
          clearTimeout(t);
          resolve();
        });
      });
    }
    await this.worker.terminate();
  }

  private enqueue(req: WorkerRequest) {
    if (this.queue.some((q) => q.type === req.type) || (this.busy && this.status.job === req.type)) return;
    this.queue.push(req);
    this.next();
  }

  private next() {
    if (this.busy) return;
    const req = this.queue.shift();
    if (!req) {
      this.emit('idle');
      return;
    }
    this.busy = true;
    const job = req.type === 'pause' ? null : req.type;
    this.set({ running: true, job, text: 'Aktualisiere …', added: 0, updated: 0, error: null, offline: false });
    this.worker.postMessage(req);
  }

  private onMessage(m: WorkerMessage) {
    if (m.type === 'progress') {
      this.set({ text: m.progress.text, added: m.progress.added, updated: m.progress.updated });
      return;
    }
    this.busy = false;
    if (m.type === 'done') {
      this.set({ running: false, job: null, text: '', added: m.added, updated: m.updated, paused: this.db.pausedManualRun() !== null });
      this.emit('changed');
    } else {
      // Offline: skip silently, the hourly check tries again.
      this.set({
        running: false,
        job: null,
        text: '',
        error: m.offline ? null : m.message,
        offline: m.offline,
        paused: this.db.pausedManualRun() !== null,
      });
    }
    this.next();
  }

  private set(patch: Partial<UpdateStatus>) {
    this.status = { ...this.status, ...patch };
    this.emit('status', this.status);
  }
}
