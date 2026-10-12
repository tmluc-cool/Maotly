import { handleAdmin } from './admin';
import { cleanupInactive, handleApi } from './api';
import type { Deps, Env } from './types';
import { error } from './util';

/**
 * GratisStatt network server.
 * Privacy: no IP addresses are read or stored, no request logs are written to D1,
 * Worker logs are disabled in wrangler.toml.
 */
export async function handle(req: Request, env: Env, deps: Deps): Promise<Response> {
  const { pathname } = new URL(req.url);
  try {
    if (pathname.startsWith('/v1/')) return await handleApi(req, env, deps);
    if (pathname === '/admin' || pathname.startsWith('/admin/')) return await handleAdmin(req, env, deps);
    if (pathname === '/') return new Response('GratisStatt', { headers: { 'Content-Type': 'text/plain' } });
    return error(404, 'Nicht gefunden');
  } catch {
    return error(500, 'Serverfehler');
  }
}

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    return handle(req, env, { fetch: (i, init) => fetch(i, init), now: Date.now });
  },
  async scheduled(_event: unknown, env: Env): Promise<void> {
    await cleanupInactive(env, Date.now());
  },
};
