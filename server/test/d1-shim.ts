import Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { D1Database, D1PreparedStatement, D1Result } from '../src/types';

/** In-memory stand-in for Cloudflare D1, built on SQLite (D1 is SQLite too). */
export function createD1(): D1Database & { raw: Database.Database } {
  const db = new Database(':memory:');
  const dir = join(__dirname, '../migrations');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) db.exec(readFileSync(join(dir, f), 'utf8'));
  const statement = (sql: string, args: unknown[] = []): D1PreparedStatement & { exec(): D1Result } => {
    const exec = (): D1Result => {
      const stmt = db.prepare(sql);
      if (stmt.reader) return { results: stmt.all(...args) as unknown[], meta: { changes: 0 } };
      const r = stmt.run(...args);
      return { results: [], meta: { changes: r.changes } };
    };
    return {
      bind: (...values: unknown[]) => statement(sql, values),
      first: async <T>() => ((db.prepare(sql).get(...args) as T | undefined) ?? null),
      all: async <T>() => exec() as D1Result<T>,
      run: async () => exec(),
      exec,
    };
  };
  return {
    raw: db,
    prepare: (sql) => statement(sql),
    batch: async (stmts) => db.transaction(() => stmts.map((s) => (s as ReturnType<typeof statement>).exec()))(),
  };
}
