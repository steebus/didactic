import type { SupabaseClient } from '@supabase/supabase-js'
import type { FoundIn, ShelfHit } from '@didactic/core/shelf'

/**
 * Search what only the database holds about the shelf: every resource's
 * readable text, and every mark, note and summary written in one.
 *
 * The rest -- titles, addresses, topics, the whole summary -- every row
 * already carries, and the inbox matches as it is typed
 * (`core/shelf.shelfMatches`). This is the half that cannot be done in
 * the page. Through `search_shelf` (058), which ranks and cuts the
 * snippets in the database where the text is.
 */
export async function searchShelf(
  db: SupabaseClient,
  userId: string,
  query: string
): Promise<ShelfHit[]> {
  const q = query.trim()
  if (!q) return []

  const { data, error } = await db.rpc('search_shelf', {
    p_user: userId,
    p_query: q,
    p_limit: 80,
  })
  if (error) throw new Error(error.message)

  return ((data ?? []) as Array<{ resource_id: string; found_in: FoundIn; snippet: string }>)
    .filter(row => row.resource_id)
    .map(row => ({ resourceId: row.resource_id, foundIn: row.found_in, snippet: row.snippet }))
}
