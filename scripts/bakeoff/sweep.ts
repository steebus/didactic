import { loadDistributions, readTopics, heading, pct } from './shared'
import { NONE } from '@didactic/core/resolution'

/**
 * What a different bar would have done, without paying for the run
 * again.
 *
 * `JEV_LINK` was set at 0.75 from the shape of the decision -- a merge
 * is irreversible, so set it high -- and the bake-off said that was
 * still too low: twenty-nine per cent of the hard negatives were merged,
 * against eleven for the arm it was meant to beat. That is a number to
 * choose, not to argue about, and the distributions from that run are
 * enough to choose it: a threshold only decides how they are read.
 *
 * The two columns that matter are not symmetric and must not be
 * averaged. **Merged** is `merge_topics` deleting a topic and its
 * history (`043`) and there is no way back. **Queued** is one press.
 * The bar belongs at the lowest value where merges stop, not at the one
 * with the best total.
 *
 * The second table is the one that decides whether the first means
 * anything. A negative the reading merged with probability 1.00 is
 * either a bad bar or a bad probe, and the only way to tell is to read
 * the pair -- so the pair is printed, by name, both ends.
 */

const BARS = [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.92, 0.95, 0.97, 0.99]

const rows = loadDistributions().filter(r => r.answered)
const aliases = rows.filter(r => r.kind === 'alias')
const neighbours = rows.filter(r => r.kind === 'neighbour')

const titleOf = new Map((await readTopics()).map(t => [t.id, t.title]))

heading(`Sweeping JEV_LINK over ${rows.length} answered probes`)
console.log(
  `${aliases.length} aliases (should link home), ${neighbours.length} neighbours (should not link)`
)
console.log('')
console.log('   bar   alias linked   alias wrong   alias queued   NEIGHBOUR MERGED   queue load')

/** The winning topic and what it scored, ignoring `none`. */
function top(probabilities: Record<string, number> | null): { id: string; p: number } | null {
  if (!probabilities) return null
  let best: { id: string; p: number } | null = null
  for (const [id, p] of Object.entries(probabilities)) {
    if (id === NONE || !Number.isFinite(p)) continue
    if (!best || p > best.p) best = { id, p }
  }
  return best
}

for (const bar of BARS) {
  let right = 0
  let wrong = 0
  let aliasQueued = 0
  for (const row of aliases) {
    const winner = top(row.probabilities)
    if (winner && winner.p >= bar) (winner.id === row.topicId ? right++ : wrong++)
    else aliasQueued++
  }

  let merged = 0
  let neighbourQueued = 0
  for (const row of neighbours) {
    const winner = top(row.probabilities)
    if (winner && winner.p >= bar) merged++
    else neighbourQueued++
  }

  const queued = aliasQueued + neighbourQueued
  const mark = merged === 0 ? '  <- merges stop here' : ''
  console.log(
    `  ${bar.toFixed(2)}   ${pct(right, aliases.length)}        ${pct(wrong, aliases.length)}       ` +
      `${pct(aliasQueued, aliases.length)}        ${pct(merged, neighbours.length)}` +
      `            ${pct(queued, rows.length)}${mark}`
  )
}

/**
 * Every negative the reading was sure about, with both names.
 *
 * Printed as the pair rather than as a score, because the question this
 * table answers is not "how high is the bar" but "is this exam honest".
 * The probes were written by asking a model for a topic that sits as
 * close to another as anything plausibly could, and that instruction
 * has an obvious failure mode: asked for something maximally close,
 * it sometimes returns the thing itself under another name. Those are
 * aliases wearing a negative's label, and every one of them is scored
 * as a false merge for getting the right answer.
 */
heading('The negatives the reading was surest about')
const worst = neighbours
  .map(row => ({ row, winner: top(row.probabilities) }))
  .filter(
    (x): x is { row: (typeof neighbours)[number]; winner: { id: string; p: number } } =>
      x.winner !== null && x.winner.p >= 0.75
  )
  .sort((a, b) => b.winner.p - a.winner.p)

console.log(`${worst.length} of ${neighbours.length} negatives scored at or above 0.75.`)
console.log('')
for (const { row, winner } of worst) {
  console.log(`  ${winner.p.toFixed(2)}  ${row.name}`)
  console.log(`        would merge into: ${titleOf.get(winner.id) ?? winner.id}`)
  console.log(`        was written from: ${row.topicTitle}`)
}

heading('Reading this')
console.log('If the pairs above are genuinely two topics, the bar belongs above them')
console.log('and the first table says what that costs in presses.')
console.log('')
console.log('If some of them are one topic under two names, they are aliases that')
console.log('were labelled negatives, every arm is being marked wrong for getting')
console.log('them right, and the exam has to be fixed before the table means anything.')
