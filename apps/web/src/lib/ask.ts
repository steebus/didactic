import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Take back something the agent kept.
 *
 * Scoped by user as well as by id, so an undo can only ever reach the
 * asker's own row, and idempotent: a second tap, or an undo after a
 * reload, removes nothing and still answers. A row that is already gone
 * is not an error worth showing anybody.
 */
export async function undoWrite(
  db: SupabaseClient,
  userId: string,
  kind: 'mark' | 'card',
  id: string
): Promise<void> {
  const table = kind === 'mark' ? 'highlights' : 'clozes'
  await db.from(table).delete().eq('id', id).eq('user_id', userId)
}
