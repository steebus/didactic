import { createClient } from '@supabase/supabase-js'
import { computeAbility } from '../src/lib/scoring.ts'

const db = createClient(
  'http://127.0.0.1:54351',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
  { auth: { persistSession: false } }
)

const { data: nodes } = await db.from('nodes').select('id, title, last_exposure_at')
for (const n of nodes) {
  const { data: exposures } = await db.from('exposures').select('*').eq('node_id', n.id)
  const { ability, confidence } = computeAbility(exposures ?? [])
  await db.from('nodes').update({
    ability,
    ability_confidence: confidence,
  }).eq('id', n.id)
}
console.log('recomputed', nodes.length, 'nodes')
