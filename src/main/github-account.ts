import { EventEmitter } from 'node:events';
import { t } from '../shared/i18n';
import type { DeviceFlowInfo, GitHubAccountState } from '../shared/types';

export interface AccountSecrets {
  get(name: 'github'): string | null;
  set(name: 'github', value: string): void;
  clear(name: 'github'): void;
}

export interface AccountDeps {
  secrets: AccountSecrets;
  /** Where the GitHub username is kept (not secret). */
  store: { getMeta(key: string): string | null; setMeta(key: string, value: string | null): void };
  fetch: typeof fetch;
  /** Client ID of the OAuth App (device flow, no scopes), null while it isn't set up. */
  clientId: () => string | null;
  /** Whether the system can store the token encrypted (Windows: always). */
  canStore?: () => boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class SignInCancelled extends Error {}

/**
 * "Sign in with GitHub" (device flow). Works without our server: the token stays encrypted on this
 * computer and is only used for searches at GitHub (30 instead of 10 per minute) and, for members,
 * to join the network.
 */
export class GitHubAccount extends EventEmitter {
  private flow: GitHubAccountState['flow'] = { state: 'idle' };
  private pending: Promise<string> | null = null;
  private cancelled = false;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private deps: AccountDeps) {
    super();
    this.now = deps.now ?? Date.now;
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  available(): boolean {
    return !!this.deps.clientId();
  }

  token(): string | null {
    return this.deps.secrets.get('github');
  }

  state(): GitHubAccountState {
    return { available: this.available(), login: this.token() ? this.deps.store.getMeta('github_login') : null, flow: this.flow };
  }

  private setFlow(flow: GitHubAccountState['flow']) {
    this.flow = flow;
    this.emit('state', this.state());
  }

  /** Signs in (or returns the existing token). Two calls at the same time share one sign-in. */
  signIn(): Promise<string> {
    const existing = this.token();
    if (existing) return Promise.resolve(existing);
    this.pending ??= this.run().finally(() => (this.pending = null));
    return this.pending;
  }

  /** Stops a running sign-in (counts as "no") or hides an error. */
  cancel() {
    if (this.pending) this.cancelled = true;
    else if (this.flow.state !== 'idle') this.setFlow({ state: 'idle' });
  }

  signOut() {
    this.cancel();
    this.deps.secrets.clear('github');
    this.deps.store.setMeta('github_login', null);
    this.setFlow({ state: 'idle' });
  }

  private async run(): Promise<string> {
    this.cancelled = false;
    try {
      const clientId = this.deps.clientId();
      if (!clientId) throw new Error(t('netMsg.signInFailed'));
      if (this.deps.canStore && !this.deps.canStore()) throw new Error(t('main.tokenNoEncryption'));
      const code = await this.post<{ device_code: string; user_code: string; verification_uri: string; expires_in: number; interval: number }>(
        'https://github.com/login/device/code',
        { client_id: clientId, scope: '' },
      );
      const info: DeviceFlowInfo = {
        userCode: code.user_code,
        verificationUri: code.verification_uri,
        expiresAt: new Date(this.now() + code.expires_in * 1000).toISOString(),
      };
      this.setFlow({ state: 'waiting', info });

      let interval = Math.max(5, code.interval) * 1000;
      let token: string | null = null;
      while (!token) {
        await this.sleep(interval);
        if (this.cancelled) throw new SignInCancelled();
        if (this.now() > Date.parse(info.expiresAt)) throw new Error(t('netMsg.codeExpired'));
        const r = await this.post<{ access_token?: string; error?: string; interval?: number }>('https://github.com/login/oauth/access_token', {
          client_id: clientId,
          device_code: code.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        });
        if (r.access_token) token = r.access_token;
        else if (r.error === 'slow_down') interval = (r.interval ?? interval / 1000 + 5) * 1000;
        else if (r.error === 'access_denied') throw new SignInCancelled();
        else if (r.error && r.error !== 'authorization_pending') throw new Error(t('netMsg.signInFailed'));
      }

      // Who signed in? Only the public username is kept.
      this.setFlow({ state: 'checking' });
      const res = await this.deps.fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Moatly' },
      });
      if (!res.ok) throw new Error(t('netMsg.signInFailed'));
      const user = (await res.json()) as { login?: unknown };
      if (typeof user.login !== 'string') throw new Error(t('netMsg.signInFailed'));
      if (this.cancelled) throw new SignInCancelled();

      this.deps.secrets.set('github', token);
      this.deps.store.setMeta('github_login', user.login);
      this.setFlow({ state: 'idle' });
      return token;
    } catch (err) {
      if (err instanceof SignInCancelled) this.setFlow({ state: 'idle' });
      else if (err instanceof TypeError) this.setFlow({ state: 'error', message: t('main.githubUnreachable') }); // offline
      else this.setFlow({ state: 'error', message: (err as Error).message || t('netMsg.signInFailed') });
      throw err;
    }
  }

  private async post<T>(url: string, body: Record<string, string>): Promise<T> {
    const res = await this.deps.fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`GitHub answered with ${res.status}`);
    return (await res.json()) as T;
  }
}
