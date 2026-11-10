import { SCHEMA } from "./schema";

export type Query = (sql: string, params?: unknown[]) => Promise<Record<string, any>[]>;

export interface Db {
  query: Query;
  /** Run statements in one transaction. */
  tx<T>(fn: (q: Query) => Promise<T>): Promise<T>;
}

const g = globalThis as unknown as { __callproofDb?: Promise<Db> };

/**
 * Postgres when DATABASE_URL is set (production). Otherwise an embedded
 * Postgres (PGlite) stored in ./.data, so local development needs no setup.
 */
export function getDb(): Promise<Db> {
  if (!g.__callproofDb) {
    g.__callproofDb = (process.env.DATABASE_URL ? connectPg(process.env.DATABASE_URL) : connectPglite()).catch((e) => {
      g.__callproofDb = undefined;
      throw e;
    });
  }
  return g.__callproofDb;
}

async function connectPg(url: string): Promise<Db> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: url, max: 5 });
  const client = await pool.connect();
  try {
    // Serialise schema setup across instances starting at the same time.
    await client.query("select pg_advisory_lock(741100)");
    await client.query(SCHEMA);
    await client.query("select pg_advisory_unlock(741100)");
  } finally {
    client.release();
  }
  return {
    query: async (sql, params) => (await pool.query(sql, params as any[])).rows,
    async tx(fn) {
      const c = await pool.connect();
      try {
        await c.query("begin");
        const out = await fn(async (sql, params) => (await c.query(sql, params as any[])).rows);
        await c.query("commit");
        return out;
      } catch (e) {
        await c.query("rollback").catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    },
  };
}

async function connectPglite(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR ?? ".data/pglite";
  if (dir !== "memory://") {
    const fs = await import("node:fs");
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new PGlite(dir);
  await db.exec(SCHEMA);
  return {
    query: async (sql, params) => (await db.query(sql, params as any[])).rows as Record<string, any>[],
    tx: (fn) =>
      db.transaction((t) => fn(async (sql, params) => (await t.query(sql, params as any[])).rows as Record<string, any>[])),
  };
}
