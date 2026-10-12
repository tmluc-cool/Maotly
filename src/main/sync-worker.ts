/**
 * Sync worker: runs in its own thread with its own database connection,
 * so the window never freezes while update packages are merged or GitHub is crawled.
 */
import Database from 'better-sqlite3';
import { join, dirname } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import {
  AbortedError,
  configure,
  crawl,
  getMeta,
  GitHubClient,
  initialCrawlState,
  isoDay,
  mergeDatabase,
  newProjectsFilter,
  OfflineError,
  setMeta,
  toRepoRow,
  updatesFilter,
  upsertRepos,
  addDays,
  type CrawlState,
} from '../shared/crawler';
import { applyPackages } from './sync/packages';
import type { JobKind, WorkerMessage, WorkerRequest } from './sync/protocol';

const { dbPath } = workerData as { dbPath: string };
const db = new Database(dbPath);
configure(db);
const tmpDir = join(dirname(dbPath), 'update-tmp');

let controller: AbortController | null = null;
let busy = false;

const post = (m: WorkerMessage) => parentPort!.postMessage(m);
const nowIso = () => new Date().toISOString();

interface ManualProgress {
  stage: 'updates' | 'new';
  since: string;
  state: CrawlState;
  added: number;
  updated: number;
}

function startRun(kind: 'delta' | 'manual', since: string | null): number {
  return Number(
    db.prepare("INSERT INTO sync_runs (kind, started_at, status, since) VALUES (?, ?, 'running', ?)").run(kind, nowIso(), since)
      .lastInsertRowid,
  );
}

function finishRun(id: number, status: 'done' | 'paused' | 'failed', added: number, updated: number, progress?: unknown) {
  db.prepare('UPDATE sync_runs SET status = ?, finished_at = ?, added = ?, updated = ?, progress = ? WHERE id = ?').run(
    status,
    status === 'paused' ? null : nowIso(),
    added,
    updated,
    progress === undefined ? null : JSON.stringify(progress),
    id,
  );
}

async function runPackages(manifestUrl: string, maxMissing: number, job: JobKind) {
  const runId = startRun('delta', getMeta(db, 'last_delta_date'));
  try {
    const r = await applyPackages({
      db,
      fetch,
      manifestUrl,
      tmpDir,
      maxMissing,
      signal: controller!.signal,
      onProgress: (p) =>
        post({
          type: 'progress',
          progress: {
            job,
            phase: p.phase === 'manifest' ? 'checking' : 'packages',
            index: p.index,
            of: p.of,
            added: p.added,
            updated: p.updated,
          },
        }),
    });
    setMeta(db, 'last_update_check', nowIso());
    finishRun(runId, 'done', r.added, r.updated);
    return r;
  } catch (err) {
    finishRun(runId, 'failed', 0, 0);
    throw err;
  }
}

async function runManual(req: Extract<WorkerRequest, { type: 'manual' }>) {
  let added = 0;
  let updated = 0;

  // 1. Update packages first (unless we are resuming a crawl).
  let runId: number;
  let progress: ManualProgress;
  const paused = req.resumeRunId
    ? (db.prepare("SELECT id, progress FROM sync_runs WHERE id = ? AND kind = 'manual' AND status IN ('paused', 'running')").get(req.resumeRunId) as
        | { id: number; progress: string | null }
        | undefined)
    : undefined;

  if (paused?.progress) {
    runId = paused.id;
    progress = JSON.parse(paused.progress);
    db.prepare("UPDATE sync_runs SET status = 'running' WHERE id = ?").run(runId);
  } else {
    const pk = await runPackages(req.manifestUrl, req.maxMissing, 'manual');
    added += pk.added;
    updated += pk.updated;
    const since = getMeta(db, 'last_delta_date') ?? getMeta(db, 'base_version') ?? addDays(isoDay(Date.now()), -7);
    runId = startRun('manual', since);
    progress = { stage: 'updates', since, state: initialCrawlState(updatesFilter(since)), added, updated };
  }

  // 2. Crawl GitHub for projects that are new or changed since the last package.
  const client = new GitHubClient({ token: req.token, signal: controller!.signal, userAgent: 'Moatly' });
  const save = () => db.prepare('UPDATE sync_runs SET progress = ?, added = ?, updated = ? WHERE id = ?').run(JSON.stringify(progress), progress.added, progress.updated, runId);
  const today = isoDay(Date.now());

  const report = () =>
    post({
      type: 'progress',
      progress: {
        job: 'manual',
        phase: 'github',
        added: progress.added,
        updated: progress.updated,
      },
    });
  report();

  try {
    for (const stage of ['updates', 'new'] as const) {
      if (progress.stage === 'new' && stage === 'updates') continue;
      if (progress.stage !== stage) {
        progress.stage = stage;
        progress.state = initialCrawlState(newProjectsFilter(progress.since));
        save();
      }
      const filter = stage === 'updates' ? updatesFilter(progress.since) : newProjectsFilter(progress.since);
      const result = await crawl({
        client,
        filter,
        state: progress.state,
        today,
        shouldStop: () => controller!.signal.aborted,
        onRepos: (repos) => {
          // first_seen_at/source of known repos stay untouched.
          const r = upsertRepos(db, repos.map(toRepoRow), 'manual');
          progress.added += r.added;
          progress.updated += r.updated;
          report();
        },
        onState: () => void save(),
      });
      if (result === 'stopped') {
        finishRun(runId, 'paused', progress.added, progress.updated, progress);
        return { added: progress.added, updated: progress.updated, paused: true };
      }
    }
    finishRun(runId, 'done', progress.added, progress.updated);
    setMeta(db, 'last_manual_update', nowIso());
    return { added: progress.added, updated: progress.updated, paused: false };
  } catch (err) {
    if (err instanceof AbortedError || controller!.signal.aborted) {
      finishRun(runId, 'paused', progress.added, progress.updated, progress);
      return { added: progress.added, updated: progress.updated, paused: true };
    }
    // Keep the progress so the run can continue later (e.g. after being offline).
    finishRun(runId, 'paused', progress.added, progress.updated, progress);
    throw err;
  }
}

function isOffline(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? '');
  return err instanceof OfflineError || /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|network/i.test(msg);
}

parentPort!.on('message', async (req: WorkerRequest) => {
  if (req.type === 'pause') {
    controller?.abort();
    return;
  }
  if (busy) return;
  busy = true;
  controller = new AbortController();
  const job: JobKind = req.type;
  try {
    if (req.type === 'packages') {
      const r = await runPackages(req.manifestUrl, req.maxMissing, 'packages');
      post({ type: 'done', job, added: r.added, updated: r.updated });
    } else if (req.type === 'manual') {
      const r = await runManual(req);
      post({ type: 'done', job, ...r });
    } else if (req.type === 'merge-base') {
      post({ type: 'progress', progress: { job, phase: 'merge-base', added: 0, updated: 0 } });
      const r = mergeDatabase(db, req.file, 'base');
      setMeta(db, 'base_version', req.baseVersion);
      post({ type: 'done', job, ...r });
    } else if (req.type === 'vacuum') {
      post({ type: 'progress', progress: { job, phase: 'vacuum', added: 0, updated: 0 } });
      db.prepare("INSERT INTO repos_fts(repos_fts) VALUES ('optimize')").run();
      db.exec('VACUUM');
      post({ type: 'done', job, added: 0, updated: 0 });
    }
  } catch (err) {
    post({ type: 'error', job, message: (err as Error).message, offline: isOffline(err) });
  } finally {
    busy = false;
    controller = null;
  }
});
