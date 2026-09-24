import { embed } from '../../apps/web/src/lib/embedding'
import { resolveConcept, type Resolution } from '../../apps/web/src/lib/resolver'
import { judgeConcepts, NEAREST_SHOWN, type ConceptToJudge } from '../../apps/web/src/lib/llm/overlap'
import { judgeWithJev, type JevVerdict } from '../../apps/web/src/lib/llm/jev'
import { cosineSimilarity } from '@didactic/core/similarity'
import { config } from '@didactic/core/config'
import { loadProbes, nominate, readSubjects, saveDistributions, heading, pct, type Probe } from './shared'

/**
 * The two arms, on one exam.
 *
 * **A, as it stands.** The embedding both nominates and decides: ten
 * candidates, `resolveConcept` bands them against `RESOLVER_MATCH` and
 * `RESOLVER_AMBIGUOUS`, Sonnet reads the nearest five and returns a
 * `confidence` it wrote about itself, `settleResolution` arbitrates.
 *
 * **B, demoted.** The embedding only nominates, and it nominates wider.
 * Jev returns a distribution over the shortlist and
 * `packages/core/resolution.ts` reads it. No cosine threshold decides
 * anything.
 *
 * Both arms see one search, one batching and one probe set, so the only
 * thing that differs between them is the judging.
 *
 * ## What is being counted
 *
 * Not accuracy. The errors are not worth the same and averaging them
 * would hide the only one that cannot be taken back: a **false merge**
 * is `merge_topics` deleting a topic and its history (`043`), while a
 * **queued** probe costs one press and a **missed** one costs a
 * duplicate that the adjudication queue will offer again later. An arm
 * that queues everything is useless but harmless; an arm that merges
 * confidently is worse than no arm at all.
 */

const BATCH = 8

/**
 * Arm A's arbitration, pinned.
 *
 * A copy of `settleResolution` as `main` has it, kept here rather than
 * exported from the app. The control arm has to be the pipeline as it
 * was on the day, and a shared function would quietly become whatever
 * the branch changed it into -- which is the one thing a control may
 * not do. Production carries no copy of it: `settleWithReading`
 * replaced it, and dead code kept alive for a harness is how a harness
 * starts lying.
 */
function settleResolution(
  resolution: Resolution,
  verdict: { sameAs: string | null; distinct: boolean } | undefined,
  similarityOf: (topicId: string) => number
): Resolution {
  if (!verdict || resolution.action === 'link') return resolution

  if (verdict.sameAs) {
    const similarity = similarityOf(verdict.sameAs)
    if (resolution.action === 'pending' && similarity >= config.RESOLVER_AMBIGUOUS) {
      return { action: 'link', topicId: verdict.sameAs, similarity }
    }
    return { action: 'pending', title: resolution.title, similarity, nearestId: verdict.sameAs }
  }

  if (verdict.distinct && resolution.action === 'pending') {
    return { action: 'create', title: resolution.title }
  }

  return resolution
}

const probes = loadProbes()
const subjects = await readSubjects()

heading(`${probes.length} probes, ${subjects.length} subjects, map read live`)

// One search per probe, shared by both arms.
const searched: Array<{
  probe: Probe
  vector: number[]
  nominated: Awaited<ReturnType<typeof nominate>>
}> = []

process.stdout.write('searching')
for (const probe of probes) {
  const vector = await embed(probe.name)
  searched.push({ probe, vector, nominated: await nominate(vector, config.RESOLVER_NOMINATED) })
  process.stdout.write('.')
}
console.log('')

const titleOf = new Map<string, string>()
for (const { nominated } of searched) for (const n of nominated) titleOf.set(n.id, n.title)

const subjectTitles = new Map(subjects.map(s => [s.id, s.title]))

/** A probe as the judging half of either arm wants it. */
function conceptFor(index: number, depth: number): ConceptToJudge {
  const { probe, vector, nominated } = searched[index]
  return {
    key: `c${index}`,
    name: probe.name,
    description: probe.description,
    nearest: nominated.slice(0, depth).map(n => ({
      id: n.id,
      title: n.title,
      summary: n.summary,
      similarity: cosineSimilarity(vector, n.embedding),
      subjects: [],
    })),
  }
}

interface Outcome {
  action: 'link' | 'pending' | 'create'
  topicId: string | null
  subjects: string[] | null
  /** False where the call was refused. Such a probe is left out of the
   *  scoring rather than counted as a correct `create`. */
  answered?: boolean
  /** Arm B only: what it gave the true topic, for calibration. */
  trueProbability?: number
  /** Arm B only: the whole distribution, kept so the bars can be swept
   *  afterwards without paying for the run again. */
  probabilities?: Record<string, number>
  scope?: Record<string, number>
}

async function runA(): Promise<Outcome[]> {
  const out: Outcome[] = []

  for (let i = 0; i < searched.length; i += BATCH) {
    const slice = searched.slice(i, i + BATCH).map((_, j) => conceptFor(i + j, NEAREST_SHOWN))
    const verdicts = await judgeConcepts({
      resourceTitle: 'A mixed reading',
      concepts: slice,
      subjects: subjects.map(s => ({ id: s.id, title: s.title, topics: s.topics })),
    })

    slice.forEach((concept, j) => {
      const index = i + j
      const { vector, nominated } = searched[index]
      // Arm A's own, narrower shortlist: the resolver has always asked
      // for ten and this arm is the pipeline as it stands.
      const candidates = nominated.slice(0, 10)
      const verdict = verdicts?.get(concept.key)
      const settled = settleResolution(
        resolveConcept(concept.name, candidates, vector),
        verdict,
        (id: string) => {
          const found = candidates.find(c => c.id === id)
          return found ? cosineSimilarity(vector, found.embedding) : 0
        }
      )

      out.push({
        action: settled.action,
        topicId:
          settled.action === 'link' ? settled.topicId
            : settled.action === 'pending' ? settled.nearestId
            : null,
        subjects: verdict ? verdict.subjects : null,
        answered: true,
      })
    })
    process.stdout.write('.')
  }

  return out
}

/** What the gateway refused, and whether splitting the batch helped. */
const trouble: string[] = []
let splits = 0

/**
 * One batch of concepts, halved on failure until it goes through.
 *
 * The gateway answered a batch of eight with
 * `GatewayInternalServerError` after three retries of its own, having
 * answered the batch before it. A harness that dies there measures
 * nothing, and worse, it cannot say *why* it died -- transient or
 * structural look identical from one failed call.
 *
 * Halving tells them apart. If the halves go through, the batch was too
 * big and the ceiling is somewhere between; if a single concept still
 * fails, it was the gateway or that one concept, and the note says
 * which. Either way the run finishes and the other 131 probes are still
 * measured.
 */
async function judgeSlice(slice: ConceptToJudge[]): Promise<Map<string, JevVerdict> | null> {
  try {
    return await judgeWithJev({
      resourceTitle: 'A mixed reading',
      concepts: slice,
      subjects: subjects.map(s => ({ id: s.id, title: s.title, topics: s.topics })),
    })
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)

    if (slice.length === 1) {
      trouble.push(`${slice[0].name}: ${why.slice(0, 160)}`)
      process.stdout.write('x')
      return null
    }

    splits++
    process.stdout.write('/')
    const half = Math.ceil(slice.length / 2)
    const merged = new Map<string, JevVerdict>()
    for (const part of [slice.slice(0, half), slice.slice(half)]) {
      const got = await judgeSlice(part)
      if (got) for (const [k, v] of got) merged.set(k, v)
    }
    return merged.size > 0 ? merged : null
  }
}

async function runB(): Promise<Outcome[]> {
  const out: Outcome[] = []

  for (let i = 0; i < searched.length; i += BATCH) {
    const slice = searched
      .slice(i, i + BATCH)
      .map((_, j) => conceptFor(i + j, config.RESOLVER_NOMINATED))
    const verdicts = await judgeSlice(slice)

    slice.forEach((concept, j) => {
      const verdict = verdicts?.get(concept.key)
      if (!verdict) {
        // Not an answer. Counted apart from a real `create` below, so a
        // refused call cannot read as the arm getting something right.
        out.push({ action: 'create', topicId: null, subjects: null, answered: false })
        return
      }
      const { reading } = verdict
      out.push({
        action: reading.action,
        topicId:
          reading.action === 'link' ? reading.topicId
            : reading.action === 'pending' ? reading.nearestId
            : null,
        subjects: verdict.subjects,
        answered: true,
        trueProbability: verdict.probabilities?.[searched[i + j].probe.topicId] ?? 0,
        scope: verdict.scope,
        probabilities: verdict.probabilities,
      })
    })
    process.stdout.write('.')
  }

  return out
}

function score(name: string, outcomes: Outcome[]): void {
  const answered = probes
    .map((p, i) => [p, outcomes[i]] as const)
    .filter(([, o]) => o.answered !== false)
  const aliases = answered.filter(([p]) => p.kind === 'alias')
  const neighbours = answered.filter(([p]) => p.kind === 'neighbour')

  const refused = probes.length - answered.length
  if (refused > 0) console.log(`  (${refused} probes left out: the call was refused)`)

  // An alias that linked to the topic it was written from.
  const hit = aliases.filter(([p, o]) => o.action === 'link' && o.topicId === p.topicId).length
  // Linked, but to something else. A merge into the wrong history.
  const wrongLink = aliases.filter(([p, o]) => o.action === 'link' && o.topicId !== p.topicId).length
  const aliasQueued = aliases.filter(([, o]) => o.action === 'pending').length
  const aliasDuplicated = aliases.filter(([, o]) => o.action === 'create').length

  // A neighbour that linked to anything is a false merge: two genuinely
  // different topics folded into one, and no way back.
  const falseMerge = neighbours.filter(([, o]) => o.action === 'link').length
  const neighbourQueued = neighbours.filter(([, o]) => o.action === 'pending').length
  const neighbourKept = neighbours.filter(([, o]) => o.action === 'create').length

  heading(name)
  console.log('  aliases — the same topic under another name')
  console.log(`    linked correctly      ${pct(hit, aliases.length)}   ${hit}`)
  console.log(`    linked to the WRONG   ${pct(wrongLink, aliases.length)}   ${wrongLink}   ← irreversible`)
  console.log(`    queued                ${pct(aliasQueued, aliases.length)}   ${aliasQueued}`)
  console.log(`    duplicated            ${pct(aliasDuplicated, aliases.length)}   ${aliasDuplicated}`)
  console.log('  neighbours — genuinely different, deliberately close')
  console.log(`    kept separate         ${pct(neighbourKept, neighbours.length)}   ${neighbourKept}`)
  console.log(`    queued                ${pct(neighbourQueued, neighbours.length)}   ${neighbourQueued}`)
  console.log(`    MERGED                ${pct(falseMerge, neighbours.length)}   ${falseMerge}   ← irreversible`)

  const irreversible = wrongLink + falseMerge
  const queued = aliasQueued + neighbourQueued
  console.log('  overall')
  console.log(`    irreversible errors   ${pct(irreversible, answered.length)}   ${irreversible}`)
  console.log(`    queue load            ${pct(queued, answered.length)}   ${queued}`)

  // Subjects, scored on aliases only: a neighbour's true membership is
  // not known, and guessing it would make the figure meaningless.
  let tp = 0, fp = 0, fn = 0
  let readAt = 0
  for (const [probe, outcome] of aliases) {
    if (!outcome.subjects) continue
    readAt++
    const got = new Set(outcome.subjects)
    const want = new Set(probe.subjectIds)
    for (const id of got) (want.has(id) ? tp++ : fp++)
    for (const id of want) if (!got.has(id)) fn++
  }
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp)
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn)
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
  console.log(`  subject filing, over ${readAt} aliases with a reading`)
  console.log(`    precision  ${(precision * 100).toFixed(1)}%   recall  ${(recall * 100).toFixed(1)}%   F1  ${(f1 * 100).toFixed(1)}%`)

  // Calibration. Only arm B has a real distribution to be calibrated:
  // arm A's number is a model's opinion of itself and scoring it as a
  // probability would flatter it.
  const calibrated = aliases.filter(([, o]) => o.trueProbability !== undefined)
  if (calibrated.length > 0) {
    const brier =
      calibrated.reduce((sum, [, o]) => sum + (1 - (o.trueProbability ?? 0)) ** 2, 0) /
      calibrated.length
    console.log(`  calibration on aliases (Brier, lower is better)   ${brier.toFixed(3)}`)
  }
}

heading('Arm A — as it stands')
console.log(`cosine decides; ${NEAREST_SHOWN} shown to Sonnet out of 10 nominated`)
const a = await runA()
console.log('')

heading('Arm B — demoted')
console.log(`cosine only nominates; ${config.RESOLVER_NOMINATED} shown to Jev`)
const b = await runB()
console.log('')

score('Arm A — as it stands', a)
score('Arm B — demoted', b)

// Kept so `sweep.ts` can ask what a different bar would have done
// without paying for the reading again. The distributions are the
// expensive part of this run and they do not change with a threshold.
saveDistributions(
  probes.map((probe, i) => ({
    kind: probe.kind,
    name: probe.name,
    topicId: probe.topicId,
    topicTitle: probe.topicTitle,
    answered: b[i].answered !== false,
    probabilities: b[i].probabilities ?? null,
    scope: b[i].scope ?? null,
  }))
)

if (splits > 0 || trouble.length > 0) {
  heading('What the gateway refused')
  console.log(`  batches halved before they went through: ${splits}`)
  console.log(`  concepts that failed even on their own:  ${trouble.length}`)
  for (const line of trouble.slice(0, 10)) console.log(`    ${line}`)
  if (splits > 0 && trouble.length === 0) {
    console.log('')
    console.log('  Every split eventually went through, so the batch size is the')
    console.log('  ceiling, not the request shape. Eight concepts at 25 candidates')
    console.log('  each is too much for one call, and production sends a book worth.')
  }
}

// The rows where they disagreed, which is where the reading is. A
// table of two percentages says which arm won; this says why.
heading('Where they disagreed')
let shown = 0
probes.forEach((probe, i) => {
  if (a[i].action === b[i].action && a[i].topicId === b[i].topicId) return
  if (shown++ >= 25) return
  const say = (o: Outcome) =>
    o.action === 'create'
      ? 'create'
      : `${o.action} → ${titleOf.get(o.topicId ?? '') ?? o.topicId}`
  console.log(`  ${probe.kind.padEnd(9)} ${probe.name}`)
  console.log(`            truth: ${probe.kind === 'alias' ? probe.topicTitle : 'its own topic'}`)
  console.log(`            A: ${say(a[i])}`)
  console.log(`            B: ${say(b[i])}`)
})
if (shown > 25) console.log(`  … and ${shown - 25} more`)

heading('Subjects, for reading the rows above')
for (const s of subjects) console.log(`  ${s.id}  ${subjectTitles.get(s.id)}`)
