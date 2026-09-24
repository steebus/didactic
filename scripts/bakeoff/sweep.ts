import { loadDistributions, heading, pct } from './shared'
import { NONE } from '@didactic/core/resolution'

/**
 * What a different bar would have done, without paying for the run
 * again.
 *
 * `JEV_LINK` was set at 0.75 from the shape of the decision -- a merge
 * is irreversible, so set it high -- and the first bake-off said that
 * was still too low: twenty-five per cent of the hard negatives were
 * merged, against nine per cent for the arm it was meant to beat. That
 * is a number to choose, not to argue about, and the distributions from
 * that run are enough to choose it: a threshold only decides how they
 * are read.
 *
 * The two columns that matter are not symmetric and must not be
 * averaged. **Merged** is `merge_topics` deleting a topic and its
 * history (`043`) and there is no way back. **Queued** is one press.
 * The bar belongs at the lowest value where merges stop, not at the one
 * with the best total.
 */

const BARS = [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.92, 0.95, 0.97, 0.99]

const rows = loadDistributions().filter(r => r.answered)
const aliases = rows.filter(r => r.kind === 'alias')
const neighbours = rows.filter(r => r.kind === 'neighbour')

heading(`Sweeping JEV_LINK over ${rows.length} answered probes`)
console.log(`${aliases.length} aliases (should link home), ${neighbours.length} neighbours (should not link)`)
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
  let right = 0, wrong = 0, aliasQueued = 0
  for (const row of aliases) {
    const winner = top(row.probabilities)
    if (winner && winner.p >= bar) (winner.id === row.topicId ? right++ : wrong++)
    else aliasQueued++
  }

  let merged = 0, neighbourQueued = 0
  for (const row of neighbours) {
    const winner = top(row.probabilities)
    if (winner && winner.p >= bar) merged++
    else neighbourQueued++
  }

  const queued = aliasQueued + neighbourQueued
  const mark = merged === 0 ? '  ← merges stop here' : ''
  console.log(
    `  ${bar.toFixed(2)}   ${pct(right, aliases.length)}        ${pct(wrong, aliases.length)}       ` +
      `${pct(aliasQueued, aliases.length)}        ${pct(merged, neighbours.length)}` +
      `            ${pct(queued, rows.length)}${mark}`
  )
}

// The neighbours that score highest are the ones any bar has to clear.
// Printed with their scores because the bar is chosen off them, and
// because a neighbour scoring 0.99 is a probe worth doubting rather
// than a threshold worth raising.
heading('The hard negatives, worst first')
const worst = neighbours
  .map(row => ({ row, winner: top(row.probabilities) }))
  .filter((x): x is { row: typeof neighbours[number]; winner: { id: string; p: number } } =>
    x.winner !== null
  )
  .sort((a, b) => b.winner.p - a.winner.p)
  .slice(0, 15)

for (const { row, winner } of worst) {
  const onto = winner.id === row.topicId ? row.topicTitle : 'another topic'
  console.log(`  ${winner.p.toFixed(2)}  ${row.name}`)
  console.log(`        would merge into ${onto}`)
}

heading('Reading this')
console.log('Pick the lowest bar where NEIGHBOUR MERGED reaches zero, then check')
console.log('what it costs in alias queued — those are the presses you pay for it.')
console.log('If no bar reaches zero, the top rows above say why: either the bar')
console.log('belongs above them, or those probes are not the negatives they claim.')
