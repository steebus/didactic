/**
 * Every topic's shape reading (063), grouped by what it says: for
 * checking the rules in core/grain.readShape against the map.
 *
 *   (env from apps/web/.env) npx vite-node scripts/shapes-report.ts
 */
import { createClient } from '@supabase/supabase-js'
import { readShape } from '@didactic/core/grain'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data } = await db
  .from('topic_shapes')
  .select('works, topic_share, subfield_share, software_share, top_topic, context, topics(title)')
type Row = { works: number; topic_share: number; subfield_share: number; software_share: number; top_topic: string | null; context: string | null; topics: { title: string } | null }
const by: Record<string, string[]> = {}
for (const row of (data ?? []) as unknown as Row[]) {
  const shape = readShape({ works: row.works, topicShare: +row.topic_share, subfieldShare: +row.subfield_share, softwareShare: +row.software_share }) ?? 'mixed'
  ;(by[shape] ??= []).push(`${row.topics?.title} | ${row.works}${row.context ? ' ctx' : ''} | top ${row.topic_share} ${row.top_topic ?? ''} | sub ${row.subfield_share} | sw ${row.software_share}`)
}
for (const [shape, lines] of Object.entries(by)) {
  console.log(`\n== ${shape} (${lines.length})`)
  for (const line of lines) console.log('  ' + line)
}
