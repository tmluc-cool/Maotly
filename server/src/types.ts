/** The parts of Cloudflare's D1 API we use (kept local so tests can provide a stand-in). */
export interface D1Result<T = unknown> {
  results: T[];
  meta: { changes: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

export interface Env {
  DB: D1Database;
  /** Shared secret for the weekly GitHub Action (wrangler secret). */
  ADMIN_SECRET: string;
  /** Numeric GitHub id of the only person allowed into /admin (wrangler secret). */
  ADMIN_GITHUB_ID: string;
  /** OAuth App for the admin login (web flow). */
  ADMIN_OAUTH_CLIENT_ID: string;
  ADMIN_OAUTH_CLIENT_SECRET: string;
  /** Random secret to sign the admin cookie (wrangler secret). */
  SESSION_SECRET: string;
  /** "owner/moatly-data" – for the weekly history in the dashboard. */
  DATA_REPO: string;
}

export interface Deps {
  fetch: typeof fetch;
  now: () => number;
}
