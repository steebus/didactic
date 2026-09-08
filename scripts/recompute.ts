import { createClient } from '@supabase/supabase-js'
import { computeAbility } from '../src/lib/scoring'
import type { Exposure } from '../src/lib/types'

/**
 * Fold the exposure log back into the cached ability figures. The
 * fixture writes exposures; this derives the numbers from them, the
 * same way the app does on every consumption.
 */
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54600',
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
  { auth: { persistSession: false } }
)

const { data: topics, error } = await db.from('topics').select('id')
if (error) throw error

for (const topic of topics ?? []) {
  const { data: exposures } = await db
    .from('exposures').select('*').eq('topic_id', topic.id)
  const { ability, confidence } = computeAbility((exposures ?? []) as Exposure[])
  await db.from('topics')
    .update({ ability, ability_confidence: confidence })
    .eq('id', topic.id)
}

console.log('recomputed', (topics ?? []).length, 'topics')
