import { embed } from '../../apps/web/src/lib/embedding'
import { config } from '@didactic/core/config'
import { loadProbes, nominate, heading, pct } from './shared'

/**
 * How wide the nomination has to be.
 *
 * This is the only measurement in the bake-off that costs nothing and
 * the only one whose answer binds everything else. Recall is the
 * ceiling on the whole pipeline: a true match the search ranks
 * fourteenth cannot be found by any reader downstream, however good,
 * because it was never shown it. No amount of judging fixes a
 * shortlist that does not contain the answer.
 *
 * `overlap.ts` shows five, on the grounds that "the far end of the
 * candidate list is noise the call pays for". That was a sound trade
 * against Sonnet. Against a model priced at $0.042 per million it is
 * not, and this prints the curve that says where to stop instead.
 *
 * Only aliases are scored. A neighbour has no right answer to be found
 * at any depth -- its whole job is to not be linked -- so including it
 * would measure nothing.
 */

const DEPTHS = [1, 3, 5, 10, 15, 20, 25, 30, 40, 50]
const MAX = Math.max(...DEPTHS)

const aliases = loadProbes().filter(p => p.kind === 'alias')
heading(`Recall of the true topic, over ${aliases.length} aliases`)

const ranks: number[] = []
for (const probe of aliases) {
  const vector = await embed(probe.name)
  const nominated = await nominate(vector, MAX)
  // Zero-based rank of the topic the alias was written from, or -1
  // where the search never returned it at any depth measured.
  ranks.push(nominated.findIndex(n => n.id === probe.topicId))
  process.stdout.write('.')
}
console.log('\n')

console.log('  depth   recall    what it costs')
for (const depth of DEPTHS) {
  const found = ranks.filter(r => r >= 0 && r < depth).length
  // Roughly what the shortlist adds to one concept's question: a topic
  // line is title plus summary plus its subjects.
  const tokens = depth * 55
  const marker =
    depth === config.RESOLVER_NOMINATED ? '  ← RESOLVER_NOMINATED'
      : depth === 5 ? '  ← what overlap.ts shows today'
      : ''
  console.log(
    `  ${String(depth).padStart(5)}  ${pct(found, aliases.length)}   ~${String(tokens).padStart(5)} tokens/concept${marker}`
  )
}

const missed = ranks.filter(r => r < 0).length
if (missed > 0) {
  heading('Never found at any depth')
  console.log(
    `${missed} of ${aliases.length} aliases (${((missed / aliases.length) * 100).toFixed(1)}%).`
  )
  console.log(
    'These are the hard ceiling. Widening the shortlist cannot reach them;\n' +
      'only a better embedding or a second retrieval route can.'
  )
  for (const [i, rank] of ranks.entries()) {
    if (rank < 0) console.log(`  ${aliases[i].name}  ←  ${aliases[i].topicTitle}`)
  }
}

const found = ranks.filter(r => r >= 0)
if (found.length > 0) {
  const sorted = [...found].sort((a, b) => a - b)
  heading('Where the true topic lands when it is found')
  console.log(`  median rank   ${sorted[Math.floor(sorted.length / 2)] + 1}`)
  console.log(`  90th centile  ${sorted[Math.floor(sorted.length * 0.9)] + 1}`)
  console.log(`  worst         ${sorted[sorted.length - 1] + 1}`)
}
