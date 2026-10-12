import { EventEmitter } from 'node:events';
import { t, type MessageKey } from '../shared/i18n';
import type { ActionResult, DeviceFlowInfo, MyDataResult, NetworkState, ServerUserData } from '../shared/types';
import { config, networkConfigured } from './config';
import type { AppDatabase } from './database';
import { SignInCancelled, type GitHubAccount } from './github-account';

export interface Secrets {
  get(name: 'session'): string | null;
  set(name: 'session', value: string): void;
  clear(name: 'session'): void;
}

export interface NetworkDeps {
  db: AppDatabase;
  secrets: Secrets;
  /** "Sign in with GitHub": joining uses this sign-in (or starts it). */
  account: GitHubAccount;
  fetch: typeof fetch;
  appVersion: string;
  now?: () => number;
  /** Whether server and OAuth App are set up. Without them nobody is asked to join. */
  available?: () => boolean;
}

const HOUR = 3_600_000;
const today = (now: number) => new Date(now).toISOString().slice(0, 10);

/**
 * The optional Moatly network. Strictly opt-in: before the user chose
 * "Mitmachen" and signed in with GitHub, nothing is sent to our server.
 */
export class Network extends EventEmitter {
  private joining = false;
  private registering = false;
  private joinError: string | null = null;
  private forceConsentDialog = false;
  private readonly now: () => number;
  private readonly available: () => boolean;

  constructor(private deps: NetworkDeps) {
    super();
    this.available = deps.available ?? networkConfigured;
    this.now = deps.now ?? Date.now;
    // The GitHub code shown in the consent dialog comes from the account.
    deps.account.on('state', () => {
      if (this.joining) this.changed();
    });
  }

  private get db() {
    return this.deps.db;
  }

  isMember(): boolean {
    return this.db.getMeta('network_consent') === 'yes' && !!this.deps.secrets.get('session');
  }

  private signInState(): NetworkState['signIn'] {
    if (this.joinError) return { state: 'error', message: this.joinError };
    if (this.registering) return { state: 'registering' };
    const flow = this.deps.account.state().flow;
    if (this.joining && flow.state === 'waiting') return { state: 'waiting', info: flow.info };
    if (this.joining && flow.state === 'checking') return { state: 'registering' };
    return { state: 'idle' };
  }

  state(): NetworkState {
    const signIn = this.signInState();
    const consent = this.db.getMeta('network_consent') as 'yes' | 'no' | null;
    const version = Number(this.db.getMeta('consent_version') ?? 0);
    const member = this.isMember();
    const available = this.available();
    const askConsent =
      available &&
      (this.forceConsentDialog || consent === null || (consent === 'yes' && version < config.consentVersion) || signIn.state !== 'idle');
    return {
      available,
      consent,
      askConsent,
      member: member ? { login: this.db.getMeta('network_login') ?? '', joinedDay: this.db.getMeta('network_joined_day') ?? '' } : null,
      signIn,
    };
  }

  private changed() {
    this.emit('state', this.state());
  }

  private saveConsent(answer: 'yes' | 'no') {
    this.db.setMeta('network_consent', answer);
    this.db.setMeta('consent_date', new Date(this.now()).toISOString());
    this.db.setMeta('consent_version', String(config.consentVersion));
  }

  /** "Nein danke, nur lokal". */
  decline() {
    if (this.joining) this.deps.account.cancel();
    this.forceConsentDialog = false;
    if (!this.isMember()) this.saveConsent('no');
    this.changed();
  }

  /** Dev helper. */
  showConsentAgain() {
    this.forceConsentDialog = true;
    this.changed();
  }

  /** "Mitmachen – mit GitHub anmelden": GitHub sign-in (if not signed in yet), then registration on our server. */
  async join(): Promise<void> {
    if (!this.available()) return;
    if (this.joining) return;
    // Members who only have to confirm a new consent text don't need to sign in again.
    if (this.isMember()) {
      this.saveConsent('yes');
      this.forceConsentDialog = false;
      this.changed();
      return;
    }
    this.joining = true;
    this.joinError = null;
    this.changed();
    try {
      const githubToken = await this.deps.account.signIn();
      this.registering = true;
      this.changed();
      const reg = await this.server<{ sessionToken: string; login: string; joinedDay: string }>('POST', '/v1/register', { githubToken });
      this.deps.secrets.set('session', reg.sessionToken);
      this.db.setMeta('network_login', reg.login);
      this.db.setMeta('network_joined_day', reg.joinedDay);
      this.saveConsent('yes');
      this.forceConsentDialog = false;
      void this.heartbeat();
    } catch (err) {
      if (err instanceof SignInCancelled) {
        // Cancelling counts as "no".
        if (!this.isMember()) this.saveConsent('no');
        this.forceConsentDialog = false;
      } else {
        this.joinError = err instanceof ServerError ? serverMessage(err) : (err as Error).message || t('netMsg.signInFailed');
      }
    } finally {
      this.joining = false;
      this.registering = false;
      this.changed();
    }
  }

  cancelJoin() {
    if (this.joining) {
      this.deps.account.cancel();
      return;
    }
    this.deps.account.cancel();
    if (this.joinError) {
      this.joinError = null;
      if (!this.isMember()) this.saveConsent('no');
      this.forceConsentDialog = false;
      this.changed();
    }
  }

  /** Leaves the network: deletes the data on the server, then everything locally. */
  async leave(): Promise<{ ok: boolean; message?: string }> {
    if (this.deps.secrets.get('session')) {
      try {
        await this.server('DELETE', '/v1/me');
      } catch (err) {
        if (!(err instanceof ServerError && err.status === 401)) {
          return { ok: false, message: t('netMsg.leaveFailed') };
        }
      }
    }
    const login = this.db.getMeta('network_login');
    // The GitHub sign-in itself stays (sign out separately in the settings).
    this.deps.secrets.clear('session');
    this.db.clearSubmissions();
    // The server deleted reviews, upvotes and answers; remove the local copies right away too.
    if (login) this.db.forgetMemberReviews(login);
    this.db.setMeta('network_login', null);
    this.db.setMeta('network_joined_day', null);
    this.db.setMeta('last_heartbeat_day', null);
    this.saveConsent('no');
    this.changed();
    return { ok: true };
  }

  async myData(): Promise<MyDataResult> {
    if (!this.isMember()) return { ok: false, message: t('netMsg.notMember') };
    try {
      return { ok: true, data: await this.server<ServerUserData>('GET', '/v1/me') };
    } catch (err) {
      return { ok: false, message: serverMessage(err) };
    }
  }

  // --- Reviews -------------------------------------------------------------

  private async act(task: () => Promise<void>, forbidden: MessageKey = 'netMsg.rejected'): Promise<ActionResult> {
    if (!this.isMember()) return { ok: false, message: t('netMsg.needMember') };
    try {
      await task();
      return { ok: true };
    } catch (err) {
      return { ok: false, message: serverMessage(err, forbidden) };
    }
  }

  /** Writes or edits the own review. It shows up locally at once, for everybody else with the next weekly update. */
  writeReview(repoId: number, rating: number, text: string): Promise<ActionResult> {
    return this.act(async () => {
      const r = await this.server<{ id: number | null; createdDay: string; updatedDay: string }>('POST', '/v1/reviews', { repoId, rating, text });
      if (r.id) {
        this.db.saveOwnReview({
          id: r.id,
          repo_id: repoId,
          author: this.db.getMeta('network_login') ?? '',
          rating,
          text: text.replace(/\r\n?/g, '\n').trim(),
          created_day: r.createdDay,
          updated_day: r.updatedDay,
        });
      }
    });
  }

  deleteReview(repoId: number): Promise<ActionResult> {
    return this.act(async () => {
      await this.server('DELETE', `/v1/reviews/repo/${repoId}`);
      this.db.removeOwnReview(repoId, this.db.getMeta('network_login') ?? '');
    });
  }

  vote(reviewId: number, on: boolean): Promise<ActionResult> {
    return this.act(async () => {
      await this.server(on ? 'POST' : 'DELETE', `/v1/reviews/${reviewId}/vote`);
      this.db.setMyVote(reviewId, on);
    }, 'netMsg.cantVoteOwn');
  }

  /** Only the owner of the GitHub project may answer; the server checks it at GitHub with the member's token. */
  reply(reviewId: number, text: string): Promise<ActionResult> {
    return this.act(async () => {
      const githubToken = this.deps.account.token();
      if (!githubToken) throw new ServerError(401, 'missing GitHub token');
      const r = await this.server<{ replyDay: string }>('POST', `/v1/reviews/${reviewId}/reply`, { text, githubToken });
      this.db.setLocalReply(reviewId, text.trim(), this.db.getMeta('network_login'), r.replyDay ?? null);
    }, 'netMsg.ownerOnly');
  }

  deleteReply(reviewId: number): Promise<ActionResult> {
    return this.act(async () => {
      await this.server('DELETE', `/v1/reviews/${reviewId}/reply`);
      this.db.setLocalReply(reviewId, null, null, null);
    });
  }

  private inFlight = new Map<string, Promise<void>>();

  /** Runs a task only once at a time (e.g. two quick heartbeats must not both be sent). */
  private single(key: string, task: () => Promise<void>): Promise<void> {
    const running = this.inFlight.get(key);
    if (running) return running;
    const p = task().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, p);
    return p;
  }

  /** At most once a day: tells the server that this member was active today. */
  heartbeat(): Promise<void> {
    return this.single('heartbeat', () => this.sendHeartbeat());
  }

  /** At most once an hour: sends collected live finds (repo ids only). */
  flushSubmissions(): Promise<void> {
    return this.single('submissions', () => this.sendSubmissions());
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.isMember()) return;
    const day = today(this.now());
    if (this.db.getMeta('last_heartbeat_day') === day) return;
    try {
      await this.server('POST', '/v1/heartbeat', { appVersion: this.deps.appVersion });
      this.db.setMeta('last_heartbeat_day', day);
    } catch {
      /* try again later */
    }
  }

  private async sendSubmissions(): Promise<void> {
    if (!this.isMember()) return;
    const last = Date.parse(this.db.getMeta('last_submission_flush') ?? '');
    if (!Number.isNaN(last) && this.now() - last < HOUR) return;
    const ids = this.db.pendingSubmissions(50);
    if (ids.length === 0) return;
    try {
      await this.server('POST', '/v1/submissions', { repoIds: ids });
      this.db.removeSubmissions(ids);
      this.db.setMeta('last_submission_flush', new Date(this.now()).toISOString());
    } catch (err) {
      if (err instanceof ServerError && err.status === 429) {
        this.db.setMeta('last_submission_flush', new Date(this.now()).toISOString());
      }
    }
  }

  // ---------------------------------------------------------------------------

  private async server<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const session = this.deps.secrets.get('session');
    if (session) headers.Authorization = `Bearer ${session}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await this.deps.fetch(`${config.serverUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      /* empty body */
    }
    if (!res.ok) throw new ServerError(res.status, (json as { error?: string })?.error ?? `Server answered with ${res.status}`);
    return json as T;
  }
}

/**
 * Message for the user in the app's language. The server's own texts are not shown,
 * the HTTP status says enough. `forbidden` explains a 400/403 for the action at hand.
 */
function serverMessage(err: unknown, forbidden: MessageKey = 'netMsg.rejected'): string {
  if (!(err instanceof ServerError)) return t('netMsg.serverUnreachable');
  if (err.status === 401) return t('netMsg.signInAgain');
  if (err.status === 400 || err.status === 403) return t(forbidden);
  if (err.status === 404) return t('netMsg.notFound');
  if (err.status === 429) return t('netMsg.dailyLimit');
  return t('netMsg.serverUnreachable');
}

export class ServerError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
