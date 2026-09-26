import { createClient } from '@supabase/supabase-js'
// `embed` stays in the app: it reads the environment and calls the
// edge function over HTTP, neither of which belongs in a package the
// phone reads.
import { embed } from '../apps/web/src/lib/embedding'
import { kinText } from '../packages/core/src/kinship'

/**
 * Regenerate every topic's embedding through the current model. An
 * embedding is a cache of the title, so this is safe to re-run; it is
 * needed after a model or dimension change.
 *
 * `--kin` does the same for the kinship vector (`052`), which is of the
 * title and summary together. The app fills those lazily, a batch at a
 * time, whenever sprouting subjects are named; this is the one-go
 * backfill for a map that already holds hundreds of topics.
 */
const kin = process.argv.includes('--kin')
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54600',
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
  { auth: { persistSession: false } }
)

const { data: topics, error } = await db.from('topics').select('id, title, summary')
if (error) throw error

let done = 0
for (const topic of topics ?? []) {
  const text = kin ? kinText(topic.title as string, topic.summary as string | null) : (topic.title as string)
  const vector = await embed(text)
  const { error: updateError } = await db.from('topics')
    .update(kin ? { kin_embedding: JSON.stringify(vector) } : { embedding: JSON.stringify(vector) })
    .eq('id', topic.id)
  if (updateError) throw updateError
  done++
}

console.log(kin ? 'kinship-embedded' : 're-embedded', done, 'topics')
