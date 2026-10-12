import { randomBytes } from 'node:crypto';

/** Helpers for .github/workflows/deploy-server.yml (set up the network server without a terminal). */

/** Values the owner can store as repository secrets; everything else is created automatically. */
export interface ProvidedSecrets {
  ADMIN_SECRET?: string;
  ADMIN_GITHUB_ID?: string;
  ADMIN_OAUTH_CLIENT_ID?: string;
  ADMIN_OAUTH_CLIENT_SECRET?: string;
}

const GENERATED = ['ADMIN_SECRET', 'SESSION_SECRET'] as const;

/**
 * Secrets to upload with the Worker. Given values always win; random ones are only created
 * when the Worker doesn't have them yet (so a redeploy never changes them).
 */
export function serverSecrets(
  existing: string[],
  provided: ProvidedSecrets,
  random: () => string = () => randomBytes(32).toString('hex'),
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(provided)) if (typeof value === 'string' && value.trim()) out[name] = value.trim();
  for (const name of GENERATED) if (!out[name] && !existing.includes(name)) out[name] = random();
  return out;
}

/** JSON array somewhere in a wrangler output (it may print notes around it). */
function jsonArray(output: string): unknown[] {
  const start = output.indexOf('[');
  const end = output.lastIndexOf(']');
  if (start < 0 || end < start) return [];
  try {
    const list = JSON.parse(output.slice(start, end + 1));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Names from `wrangler secret list --format json`. */
export function secretNames(output: string): string[] {
  return jsonArray(output)
    .map((s) => (s as { name?: unknown })?.name)
    .filter((n): n is string => typeof n === 'string');
}

/** ID of a D1 database from `wrangler d1 list --json`, or null. */
export function d1DatabaseId(output: string, name: string): string | null {
  const db = jsonArray(output).find((d) => (d as { name?: unknown })?.name === name) as Record<string, unknown> | undefined;
  const id = db?.uuid ?? db?.id ?? db?.database_id;
  return typeof id === 'string' && /^[0-9a-f-]{32,36}$/i.test(id) ? id : null;
}

/** First workers.dev address in the output of `wrangler deploy`. */
export function workerUrl(output: string): string | null {
  return /https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.workers\.dev/i.exec(output)?.[0] ?? null;
}

const SERVER_URL = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
const CLIENT_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** Writes server address and OAuth Client ID into src/main/config.ts. Both are public, no secrets. */
export function applyNetworkConfig(source: string, opts: { serverUrl?: string; clientId?: string }): string {
  let out = source;
  if (opts.serverUrl) {
    if (!SERVER_URL.test(opts.serverUrl)) throw new Error(`Invalid server address: ${opts.serverUrl}`);
    out = out.replace(/serverUrl: '[^']*'/, `serverUrl: '${opts.serverUrl}'`);
  }
  if (opts.clientId) {
    if (!CLIENT_ID.test(opts.clientId)) throw new Error('Invalid OAuth Client ID');
    out = out.replace(/oauthClientId: '[^']*'/, `oauthClientId: '${opts.clientId}'`);
  }
  return out;
}
