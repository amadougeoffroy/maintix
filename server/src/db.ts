import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import pg from 'pg'

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
  exec(sql: string): Promise<void>
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>
  close(): Promise<void>
}

// Les bigint Postgres (int8) sortent en texte par défaut : on les convertit en nombres (seq < 2^53).
pg.types.setTypeParser(20, (v) => Number(v))

export function pgDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString, max: 10 })
  const wrap = (q: { query: pg.Pool['query'] }): Omit<Db, 'tx' | 'close'> => ({
    query: async <T,>(sql: string, params?: unknown[]) => ({ rows: (await q.query(sql, params as unknown[])).rows as T[] }),
    exec: async (sql: string) => void (await q.query(sql)),
  })
  return {
    ...wrap(pool),
    async tx(fn) {
      const client = await pool.connect()
      try {
        await client.query('begin')
        const inner: Db = { ...wrap(client as unknown as pg.Pool), tx: (f) => f(inner), close: async () => {} }
        const out = await fn(inner)
        await client.query('commit')
        return out
      } catch (e) {
        await client.query('rollback').catch(() => {})
        throw e
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}

/** Postgres embarqué (WASM) : tests et démonstration locale sans serveur de base. */
export async function pgliteDb(): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite')
  const lite = new PGlite()
  await lite.waitReady
  type Q = Pick<InstanceType<typeof PGlite>, 'query' | 'exec'>
  const wrap = (q: Q): Omit<Db, 'tx' | 'close'> => ({
    query: async <T,>(sql: string, params?: unknown[]) => ({ rows: (await q.query<T>(sql, params)).rows }),
    exec: async (sql: string) => void (await q.exec(sql)),
  })
  return {
    ...wrap(lite),
    tx: (fn) =>
      lite.transaction(async (t) => {
        const inner: Db = { ...wrap(t as unknown as Q), tx: (f) => f(inner), close: async () => {} }
        return fn(inner)
      }),
    close: () => lite.close(),
  }
}

export async function migrate(db: Db, dir: string): Promise<string[]> {
  await db.exec('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())')
  const done = new Set((await db.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name))
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
  const applied: string[] = []
  for (const f of files) {
    if (done.has(f)) continue
    const sql = await readFile(join(dir, f), 'utf8')
    await db.tx(async (t) => {
      await t.exec(sql)
      await t.query('insert into schema_migrations (name) values ($1)', [f])
    })
    applied.push(f)
  }
  return applied
}
