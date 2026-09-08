import { createClient } from '@supabase/supabase-js'
import { embed } from '../src/lib/embedding'
import { cosineSimilarity } from '../src/lib/resolver'

/**
 * Measure the resolver's similarity bands against the real topic set.
 *
 * Prints the distinct topics that look most alike (which must never
 * auto-merge) and a set of known restatements (which should link). A
 * safe MATCH threshold sits above the first and at or below the second;
 * when those cross, no honest auto-link band exists and MATCH belongs
 * above the highest distinct pair so near-duplicates reach the user.
 */
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54600',
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
  { auth: { persistSession: false } }
)

// Known restatements of one topic. Extend as real duplicates appear.
const RESTATEMENTS: Array<[string, string]> = [
  ['React Hooks', 'Hooks in React'],
  ['PostgreSQL', 'Postgres'],
  ['CDN Distribution', 'Content Delivery Network'],
  ['Auth', 'Authentication'],
  ['Database Indexing', 'Indexing in databases'],
  ['Vector Search', 'Vector similarity search'],
  ['Prompt Design', 'Prompt engineering'],
]

const { data: topics, error } = await db
  .from('topics').select('title').eq('state', 'active')
if (error) throw error

const titles = (topics ?? []).map(t => t.title as string)
const vectors = new Map<string, number[]>()
for (const title of titles) vectors.set(title, await embed(title))

const distinct: Array<[string, string, number]> = []
for (let i = 0; i < titles.length; i++) {
  for (let j = i + 1; j < titles.length; j++) {
    distinct.push([
      titles[i], titles[j],
      cosineSimilarity(vectors.get(titles[i])!, vectors.get(titles[j])!),
    ])
  }
}
distinct.sort((a, b) => b[2] - a[2])

console.log('Distinct topics that look most alike (must not auto-merge):')
for (const [a, b, s] of distinct.slice(0, 8)) {
  console.log(' ', s.toFixed(3), `${a} / ${b}`)
}

const restated: number[] = []
console.log('\nRestatements of one topic (should link):')
for (const [a, b] of RESTATEMENTS) {
  const s = cosineSimilarity(await embed(a), await embed(b))
  restated.push(s)
  console.log(' ', s.toFixed(3), `${a} / ${b}`)
}

const highestDistinct = distinct[0]?.[2] ?? 0
const lowestRestatement = Math.min(...restated)

console.log(`\nHighest distinct pair:  ${highestDistinct.toFixed(3)}`)
console.log(`Lowest restatement:     ${lowestRestatement.toFixed(3)}`)
console.log(
  lowestRestatement > highestDistinct
    ? `A clean MATCH threshold exists between them.`
    : `The bands overlap: no cutoff separates them. Keep MATCH above ` +
      `${highestDistinct.toFixed(3)} so near-duplicates go to the user.`
)
