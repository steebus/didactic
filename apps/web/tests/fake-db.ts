import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * A stand-in for the admin client, enough of it for the filing and
 * removal tests: eq, in, neq and not-null filters, head counts (on
 * `exposures` only), deletes that actually take the rows away, and a log
 * of every write.
 */
type Row = Record<string, unknown>

export function fakeDb(tables: Record<string, Row[]>, { exposures = 0, failing = [] as string[] } = {}) {
  const log: Array<{ table: string; op: string; row?: Row; where: Array<[string, string, unknown]> }> = []
  const from = (table: string) => {
    const where: Array<[string, string, unknown]> = []
    let op = 'select'
    let row: Row | undefined
    let head = false
    const q: Record<string, unknown> = {}
    const rows = () =>
      (tables[table] ?? []).filter(r =>
        where.every(([how, k, v]) =>
          how === 'eq' ? r[k] === v
          : how === 'in' ? (v as unknown[]).includes(r[k])
          : how === 'neq' ? r[k] !== v
          : how === 'notnull' ? r[k] !== null && r[k] !== undefined
          : true
        )
      )
    q.select = (_c?: string, opts?: { head?: boolean }) => {
      head = Boolean(opts?.head)
      return q
    }
    q.eq = (k: string, v: unknown) => (where.push(['eq', k, v]), q)
    q.in = (k: string, v: unknown[]) => (where.push(['in', k, v]), q)
    q.neq = (k: string, v: unknown) => (where.push(['neq', k, v]), q)
    q.not = (k: string) => (where.push(['notnull', k, null]), q)
    q.order = () => q
    q.update = (r: Row) => ((op = 'update'), (row = r), q)
    q.delete = () => ((op = 'delete'), q)
    q.insert = async (r: Row) => (log.push({ table, op: 'insert', row: r, where }), { error: null })
    q.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null })
    q.then = (resolve: (v: unknown) => void) => {
      if (failing.includes(table)) return resolve({ data: null, error: { message: 'no such table' } })
      if (op !== 'select') {
        if (op === 'delete') {
          const going = new Set(rows())
          tables[table] = (tables[table] ?? []).filter(r => !going.has(r))
        }
        log.push({ table, op, row, where })
        return resolve({ error: null })
      }
      if (head) return resolve({ count: table === 'exposures' ? exposures : 0, error: null })
      return resolve({ data: rows(), error: null })
    }
    return q
  }
  const rpc = async (fn: string) => (log.push({ table: fn, op: 'rpc', where: [] }), { error: null })
  const storage = {
    from: (bucket: string) => ({
      remove: async (paths: string[]) => (log.push({ table: `storage:${bucket}`, op: 'remove', row: { paths }, where: [] }), { error: null }),
    }),
  }
  return { db: { from, rpc, storage } as unknown as SupabaseClient, log }
}

