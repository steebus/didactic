import { createClient } from '@supabase/supabase-js'
import { embed } from '../apps/web/src/lib/embedding'

/**
 * Regenerate every topic's embedding through the current model. An
 * embedding is a cache of the title, so this is safe to re-run; it is
 * needed after a model or dimension change.
 */
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54600',
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
  { auth: { persistSession: false } }
)

const { data: topics, error } = await db.from('topics').select('id, title')
if (error) throw error

let done = 0
for (const topic of topics ?? []) {
  const vector = await embed(topic.title as string)
  const { error: updateError } = await db.from('topics')
    .update({ embedding: JSON.stringify(vector) })
    .eq('id', topic.id)
  if (updateError) throw updateError
  done++
}

console.log('re-embedded', done, 'topics')
