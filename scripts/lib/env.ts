import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Reads a variable from the environment or from .env in the project root. */
export function envVar(name: string, root = process.cwd()): string | null {
  if (process.env[name]) return process.env[name]!.trim();
  const file = join(root, '.env');
  if (!existsSync(file)) return null;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${name}\\s*=\\s*["']?([^"'\\s]+)["']?\\s*$`));
    if (m) return m[1];
  }
  return null;
}

export function formatNumber(n: number): string {
  return n.toLocaleString('de-CH');
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${m} min` : m ? `${m} min ${s % 60} s` : `${s} s`;
}
