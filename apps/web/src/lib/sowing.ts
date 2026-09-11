import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { embed } from './embedding'
import { resolveConcept, fetchCandidates, neighboursFor } from './resolver'
import { recomputeAbilities } from './scoring'
import { config } from '@didactic/core/config'
import { proposeEdges } from './llm/edges'
import type { Fidelity } from '@didactic/core/documents'
import type { OutlineEntry } from '@didactic/core/passages'
import { flattenChapters, printOutline, bedEdgesFromOutline } from '@didactic/core/documentBed'

// The shape moved to `@didactic/core/shapes`, where the phone can name
// it too; the query that builds it needs a client and the cache, so it
// stays here. Re-exported so `@/lib/sowing` still answers for both.
import type { Assessment } from '@didactic/core/shapes'


/**
 * Laying out a bed: asking the model for a map of a subject, and
 * planting what comes back.
 *
 * This lives away from the route that first ran it because it is now
 * run from two places. A sowing that dies part way -- the platform's
 * minute runs out during the embeddings, most of it -- leaves the
 * subject standing with nothing in it, because the subject row is
 * written before the topics are. That bed is not lost, it is empty,
 * and the sheet offers to lay it out again from the answers it already
 * holds. Both paths must do the same thing or the second one is a
 * different feature wearing the first one's name.
 */

/** Embeddings and similarity searches run in parallel, but only a few
 *  at a time. The embedding function holds a model in memory per
 *  instance, and six at once finds its limits rather than its speed. */
const CONCURRENCY = 3

/**
 * How many existing topics a new bed is offered to relate itself to.
 *
 * Nearest by embedding, so the cap keeps the ones most likely to be
 * genuinely related rather than an arbitrary slice. Thirty is enough
 * for a bed to find its neighbours on a map of a few hundred topics
 * and small enough that the prompt stays a prompt.
 */
const EDGE_NEIGHBOURS = 30

/**
 * What planting a bed needs after the map arrives: an embedding and a
 * similarity search per topic, the writes, and the edges. A second go
 * at the map is only affordable while this much of the minute is left.
 */
const PLANTING_NEEDS_MS = 32_000

/**
 * What the edge pass needs to finish.
 *
 * It is one more model call over the whole bed at an eight thousand
 * token ceiling, and on a twenty-topic bed it is the longest single
 * thing in the request. Started with less than this left, it does not
 * relate the bed -- it takes the whole function down with it, and a
 * bed that was already written to the database is reported to the
 * browser as a timeout. Skipped, the bed stands unrelated and says so.
 */
const EDGES_NEED_MS = 22_000

/** What the model is told on the second go. It is told what it did
 *  rather than asked the same thing twice, because the same question
 *  asked identically tends to be answered identically. */
const ASK_AGAIN = `

Your previous attempt recorded no topics at all. That is never the right answer: every subject has topics in it. Record the list this time, at least six of them, before anything else.`

/** The same rungs the roots slider prints, so the model reads and
 *  writes the figure the way the user set it. */
const ROOT_STAGES = [
  'bare ground, no prior knowledge at all',
  'just germinated: knows the words, nothing has taken hold',
  'seedling: can follow a conversation about it',
  'in leaf: uses it with the documentation open',
  'well rooted: works in it without looking much up',
  'in full flower: mastery, could teach it',
]

export interface Qualifier {
  prompt: string
  level: number
  /** What a good answer shows. Written when the question was, never
   *  shown to the user, and used here as the rubric to mark against. */
  probes: string
  answer: string
}

export interface Evidence {
  resourceId?: string
  title: string
  kind: string
  /** Set only on a document the user asked the bed to follow. Null or
   *  absent is the ordinary case: filed as material, steering nothing. */
  fidelity?: Fidelity
}

/**
 * A document the bed is being laid out from, with its structure.
 *
 * Only ever populated for a PDF whose rung is `verbatim` or `follow`
 * and whose outline has actually been read. A document handed over at
 * `source`, or one still being read when the bed is sown, is evidence
 * like any other -- it informs the figure and is filed against the
 * subject, and the bed is laid out without reference to its shape.
 */
export interface SourceDocument {
  resourceId: string
  title: string
  fidelity: Fidelity
  chapters: OutlineEntry[]
  /** Whether the shape is the document's own or a reading of its
   *  contents page. A bed laid out to the letter from a guess is worth
   *  saying out loud, so the sheet is told. */
  outlineSource: 'bookmarks' | 'model' | 'none'
}

/** Everything the user said on the sowing sheet. Every field below the
 *  subject's name is optional: a subject named and nothing else still
 *  lays out a bed, it just rests on the name alone. */
export interface Brief {
  subject: string
  roots: number | null
  confident: string
  gaps: string
  depth: string
  qualifiers: Qualifier[]
  evidence: Evidence[]
  /** Documents whose shape the bed is meant to follow. */
  sources: SourceDocument[]
}

export interface Proposal {
  name: string
  summary: string
  estimated_level: number
  /** The chapter this topic was named for, when the bed is being laid
   *  out to the letter. It is how the edges the document asserts are
   *  matched back to the topics that were actually written. */
  chapter?: string
}


const TOOL = {
  name: 'record_subject_topics',
  description:
    'Record the topics within a subject, an estimated starting level for each, and a reading of what the answers actually showed.',
  input_schema: {
    type: 'object' as const,
    properties: {
      topics: {
        type: 'array',
        minItems: 6,
        description:
          'The topics, six at the very least. A subject always has topics in it: recording none is not an answer, and an empty list is never the right one.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            summary: { type: 'string' },
            estimated_level: { type: 'number', description: '1-5, based on the answers given.' },
          },
          required: ['name', 'summary', 'estimated_level'],
        },
      },
      assessment: {
        type: 'object',
        description:
          'Your reading of where they actually stand, from what they wrote rather than from what they claimed. Omit entirely if they gave you nothing to read.',
        properties: {
          level: {
            type: 'number',
            description:
              '1-5 on the same scale as their own figure: what their answers demonstrate, not what they say.',
          },
          note: {
            type: 'string',
            description:
              'Two or three sentences addressed to them, saying what the answers showed and what they did not. Plain and specific; no praise, no hedging.',
          },
          shown: {
            type: 'array',
            items: { type: 'string' },
            description: 'Short phrases naming what they demonstrably hold.',
          },
          missing: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Short phrases naming what they did not show — wrong, vague, or skipped.',
          },
        },
        required: ['level', 'note', 'shown', 'missing'],
      },
    },
    required: ['topics'],
  },
}

/**
 * Load the structure of every document the bed is meant to follow.
 *
 * A document only reaches here once it has been read: the outline is
 * written by the first ingestion round, and a book uploaded a moment
 * before the bed is sown may still be part way through. That is not an
 * error and does not hold the sowing up -- a document with no outline
 * yet is dropped to plain evidence, which is what it would have been
 * before any of this existed. Saying so is the caller's job; the sheet
 * offers to lay the bed out again once the reading has finished.
 */
export async function loadSourceDocuments(
  db: SupabaseClient,
  evidence: Evidence[]
): Promise<SourceDocument[]> {
  const wanted = evidence.filter(
    (e): e is Evidence & { resourceId: string; fidelity: Fidelity } =>
      Boolean(e.resourceId) && Boolean(e.fidelity)
  )
  if (wanted.length === 0) return []

  const { data } = await db
    .from('resource_outline')
    .select('resource_id, chapters, source')
    .in('resource_id', wanted.map(e => e.resourceId))

  const outlines = new Map(
    (data ?? []).map(row => [
      row.resource_id as string,
      {
        chapters: (row.chapters as OutlineEntry[] | null) ?? [],
        source: (row.source as 'bookmarks' | 'model' | 'none') ?? 'none',
      },
    ])
  )

  return wanted.flatMap(e => {
    const held = outlines.get(e.resourceId)
    if (!held || held.chapters.length === 0) return []
    return [
      {
        resourceId: e.resourceId,
        title: e.title,
        fidelity: e.fidelity,
        chapters: held.chapters,
        outlineSource: held.source,
      },
    ]
  })
}

/**
 * Embed one name, with a second go.
 *
 * The embedding function is a cold-starting edge instance holding a
 * model, so the occasional call fails for reasons that have gone by the
 * time you ask again. One retry costs a moment; not retrying costs the
 * whole sowing.
 */
async function embedOnce(name: string): Promise<number[]> {
  try {
    return await embed(name)
  } catch {
    await new Promise(resolve => setTimeout(resolve, 400))
    return embed(name)
  }
}

/** Run an async job over a list a few at a time, in order. */
async function inBatches<T, R>(
  items: T[],
  size: number,
  job: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(job))))
  }
  return out
}

/**
 * Everything the user said on the sowing sheet, as one brief for the
 * model. All of it is optional: a subject named and nothing else still
 * lays out a bed, it just rests on the subject's name alone.
 */
function buildBrief(input: Brief) {
  const parts: string[] = []

  if (input.roots !== null) {
    parts.push(
      `They put their own roots in this subject at ${input.roots} out of 5 — ${ROOT_STAGES[input.roots]}.`
    )
  }
  if (input.confident) parts.push(`What they say they already hold:\n${input.confident}`)
  if (input.gaps) parts.push(`What they say they have bounced off or avoided:\n${input.gaps}`)
  if (input.evidence.length) {
    parts.push(
      `Evidence they handed over for the above — books read, courses done, qualifications held:\n${
        input.evidence.map(e => `- ${e.title} (${e.kind})`).join('\n')
      }`
    )
  }

  // The qualifying set is the only evidence here that is about the
  // subject rather than about how they feel, so it is worth more than
  // the rest. An unanswered question is evidence too: skipping the
  // hard end of a graded set says something.
  const answered = input.qualifiers.filter(q => q.answer.trim())
  if (answered.length) {
    parts.push(
      `Their answers to the qualifying questions, easiest first. These are the strongest evidence here — they are about the subject rather than about how they feel — so weigh them above the self-report:\n${
        answered
          .map(q =>
            `- [rung ${q.level}/5] ${q.prompt}${
              q.probes ? `\n  A good answer shows: ${q.probes}` : ''
            }\n  They wrote: ${q.answer.trim()}`
          )
          .join('\n')
      }`
    )
    const skipped = input.qualifiers.length - answered.length
    if (skipped > 0) {
      parts.push(
        `They left ${skipped} of the ${input.qualifiers.length} qualifying questions unanswered. Unanswered is not wrong, but do not read it as held either.`
      )
    }
  }

  return parts.join('\n\n')
}

/**
 * The document, as the model is told about it.
 *
 * Only `follow` and `source` come through here. `verbatim` does not ask
 * the model what the topics are at all -- it tells it, and asks only
 * what each chapter should be called on a map, which is a different
 * question and a different tool (see `proposeMap`).
 *
 * The difference between the two rungs handled here is a real one and
 * is stated as such. `follow` makes the document the starting point and
 * gives explicit permission to depart from it, which is what a reader
 * asking for its order rather than its letter wants. `source` keeps the
 * document as evidence of what the subject contains and takes its
 * arrangement as one author's choice, which is all it is.
 */
function sourceInstruction(sources: SourceDocument[]): string {
  const parts: string[] = []

  for (const source of sources) {
    const flat = flattenChapters(source.chapters)
    if (flat.length === 0) continue

    if (source.fidelity === 'follow') {
      parts.push(
        `They handed over "${source.title}" and asked for the bed to follow its order. Here is its structure:

${printOutline(flat)}

Start from this. Keep its order and its emphasis — the page ranges say what it gives weight to, and a sixty-page chapter is not the same size of thing as a two-page one. You may merge two chapters that are one topic, split one that is plainly two, and add what the subject needs and this document happens to skip. Name every topic canonically regardless: a chapter title is a label in a book, not a concept on a map.`
      )
    } else if (source.fidelity === 'source') {
      parts.push(
        `They handed over "${source.title}" as source material, which covers:

${printOutline(flat)}

Read this for what the subject contains, not for how it should be arranged. Its order is one author's choice and you are not bound by it. Lay the bed out as you would anyway, informed by what this shows the subject to include.`
      )
    }
  }

  return parts.join('\n\n')
}

/**
 * How far the user said they want to take the subject decides the shape
 * of the bed, not just its labels: an overview is broad and shallow, a
 * mastery run is narrow and finely cut.
 */
function scopeInstruction(depth: string) {
  if (!depth.trim()) {
    return 'They said nothing about how far they want to take it, so cut 10 to 16 topics at an ordinary working grain.'
  }
  return `How far they want to take it, in their words:\n${depth}\n\nLet that set both the number of topics and how finely they are cut. Someone who wants an overview or is merely curious gets 6 to 10 broad topics and no specialist corners. Someone who wants a working knowledge gets 10 to 16. Someone who wants to master it gets 16 to 24, cut fine enough that each one is a real piece of work, including the awkward corners a survey would skip.`
}

/** Trim a model-written list to something a margin can print. */
const phrases = (v: unknown, cap = 5) =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .map(x => x.trim())
        .slice(0, cap)
    : []

interface RawMap {
  topics?: unknown
  assessment?: { level?: number; note?: string; shown?: unknown; missing?: unknown }
}

/**
 * The three ways a map fails to arrive, told apart because they have
 * different causes and different remedies -- and because only one of
 * them is worth asking twice.
 *
 * `unstructured` is no tool call at all: the model answered in prose,
 * or refused. `truncated` is a tool call cut off at the token ceiling,
 * whose input is whatever parsed out of half a JSON document -- topics
 * as a bare string, or absent. Reading that as a list is where
 * "(k.topics ?? []).filter is not a function" came from. `empty` is a
 * whole tool call that recorded nothing.
 */
export type MapProblem = 'unstructured' | 'truncated' | 'empty'

export const PROBLEM_NOTES: Record<MapProblem, string> = {
  unstructured:
    'The model answered without filling the map in at all. Try again in a moment.',
  truncated:
    'The map came back half-written: the model hit its length ceiling part way through the list. Try a shallower scope, or a subject cut into two.',
  empty:
    'The map came back empty — the model recorded no topics at all. Trying again usually gets one; if it keeps happening, try naming the subject differently.',
}

export interface MapReading {
  topics: Proposal[]
  raw: RawMap
  problem: MapProblem | null
  /** What actually arrived, in one line. Written for the log and for
   *  the sentence the user reads, because "the map came back empty"
   *  with nothing beside it could only ever be guessed at from the
   *  outside -- which is exactly how the last one was diagnosed. */
  diagnostic: string
}

/** Read the model's answer into a list of topics, and say plainly what
 *  came back when it cannot be read. */
function readMap(res: Anthropic.Message): MapReading {
  const tool = res.content.find(c => c.type === 'tool_use')
  const raw: RawMap = tool && tool.type === 'tool_use' ? (tool.input as RawMap) : {}
  const list = Array.isArray(raw.topics) ? raw.topics : []

  // The model's shape is a promise, not a guarantee. Anything without a
  // usable name cannot be embedded or resolved, so it is dropped rather
  // than crashing the request.
  const topics: Proposal[] = list
    .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null)
    .filter(t => typeof t.name === 'string' && t.name.trim().length > 0)
    .map(t => ({
      name: (t.name as string).trim(),
      summary: typeof t.summary === 'string' ? t.summary : '',
      estimated_level: Number.isFinite(t.estimated_level) ? (t.estimated_level as number) : 1,
      ...(typeof t.chapter === 'string' && t.chapter.trim()
        ? { chapter: (t.chapter as string).trim() }
        : {}),
    }))

  const shape = Array.isArray(raw.topics)
    ? `${raw.topics.length} recorded, ${topics.length} usable`
    : raw.topics === undefined
      ? 'no topics at all'
      : `topics arrived as ${typeof raw.topics}`

  const problem: MapProblem | null =
    !tool
      ? 'unstructured'
      : res.stop_reason === 'max_tokens'
        ? 'truncated'
        : topics.length === 0
          ? 'empty'
          : null

  return {
    topics,
    raw,
    problem,
    diagnostic: `stop_reason ${res.stop_reason ?? 'none'}, ${
      res.usage?.output_tokens ?? '?'
    } output tokens, ${tool ? shape : 'no tool call'}`,
  }
}

/**
 * Ask the model to break a subject into topics.
 *
 * `assess` asks for the reading of the answers as well, which is only
 * worth having once: a bed being laid out a second time already has
 * the reading the first attempt wrote, and asking for it again would
 * spend tokens rewriting something the user has already been shown.
 *
 * `deadline` is when the request as a whole must be finished, so an
 * empty map is only asked twice while there is still time to plant
 * what comes back.
 */
export async function proposeMap(
  brief: Brief,
  { assess, deadline }: { assess: boolean; deadline: number }
): Promise<MapReading> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const { subject, roots, depth } = brief
  const written = buildBrief(brief)

  // A document to be followed to the letter is not a scope instruction
  // and not a hint. It decides which topics there are, and the only
  // question left for the model is what each one is called.
  const toTheLetter = brief.sources.find(
    source => source.fidelity === 'verbatim' && source.chapters.length > 0
  )
  const chapters = toTheLetter ? flattenChapters(toTheLetter.chapters) : []
  const verbatim = toTheLetter && chapters.length > 0 ? { source: toTheLetter, chapters } : null

  const opening = verbatim
    ? `The subject "${subject}" is being laid out from a document the reader asked to be followed to the letter: "${verbatim.source.title}".

Here is its structure, in its order:

${printOutline(verbatim.chapters)}

Record exactly one topic for each of the ${verbatim.chapters.length} entries above, in the same order, and no others. You are not choosing what the topics are — the document has chosen. What you are deciding is what each one is called.

Give each a canonical name: the concept it teaches, named as a knowledge graph would name it, not as the chapter is titled. "Getting started" is not a concept; whatever that chapter actually introduces is. Where a chapter title already is the canonical name, use it unchanged. Record the chapter title verbatim in the \`chapter\` field so each topic can be matched back to it.`
    : `Break the subject "${subject}" into learnable topics. Topics are areas within the subject; they need not relate to one another. Use canonical names that would match an existing knowledge graph.

${scopeInstruction(depth)}`

  const instruction = `${opening}

${sourceInstruction(brief.sources)}

${written ? `What they told us about where they stand:\n\n${written}` : 'They said nothing about where they stand, so assume nothing.'}

Estimate a starting level of 1-5 per topic${
    roots !== null ? `, anchored on their own figure of ${roots}` : ''
  }. Vary it: what they named as solid should sit above what they named as a gap, and a topic nobody mentioned sits at the anchor or below. Be conservative throughout — this is a low-confidence prior that real evidence will overwrite.${
    roots === 0
      ? ' They have said outright that they have no prior knowledge, so every level is 1.'
      : ''
  }

${
  assess
    ? `Then give the assessment: your own reading of where they stand, judged from what they wrote rather than from what they claimed. Mark the answers as a knowledgeable person would — a correct but thin answer at rung 1 is not the same as a fluent one at rung 4, and a confident wrong answer counts against. Say plainly where the answers were vague or absent. This is printed back to them beside their own figure, so it must be specific enough to argue with.`
    : 'They gave nothing to read, so omit the assessment entirely.'
}`

  // Laying out to the letter asks for one more field per topic -- the
  // chapter it answers to -- so the document's own edges can be matched
  // back to the topics that were actually written. The tool is built
  // from the ordinary one rather than written out again, so the two
  // cannot drift apart.
  const tool = verbatim
    ? {
        ...TOOL,
        input_schema: {
          ...TOOL.input_schema,
          properties: {
            ...TOOL.input_schema.properties,
            topics: {
              ...TOOL.input_schema.properties.topics,
              minItems: verbatim.chapters.length,
              description: `Exactly one topic per chapter of the document, in the document's order. ${verbatim.chapters.length} of them.`,
              items: {
                ...TOOL.input_schema.properties.topics.items,
                properties: {
                  ...TOOL.input_schema.properties.topics.items.properties,
                  chapter: {
                    type: 'string',
                    description:
                      "The chapter title this topic was named for, copied exactly as given.",
                  },
                },
                required: [
                  ...TOOL.input_schema.properties.topics.items.required,
                  'chapter',
                ],
              },
            },
          },
        },
      }
    : TOOL

  /** Ask for the map. `again` is empty on the first go and carries the
   *  complaint on the second. */
  const askForMap = (again: string) =>
    client.messages.create({
      model: 'claude-sonnet-5',
      // A long document imposes a long list, and a bed cut off half way
      // through its chapters is the `truncated` problem rather than a
      // bed. Sized to the work rather than fixed.
      max_tokens: verbatim ? Math.min(16_000, 4_000 + verbatim.chapters.length * 120) : 4_000,
      tools: [tool],
      tool_choice: { type: 'tool', name: 'record_subject_topics' },
      messages: [{ role: 'user', content: `${instruction}${again}` }],
    })

  let map = readMap(await askForMap(''))

  // A map that comes back with nothing on it is not the user's fault,
  // and it is not usually the subject's either: the same model, the
  // same key and the same forced tool wrote a qualifying set about
  // this very subject a minute earlier, on this very sheet. What it is
  // is a bad roll, and the remedy for a bad roll is to roll again.
  //
  // It is worth the seconds because of what the alternative costs: the
  // user is sent back to a sheet they have just spent ten minutes on,
  // holding an error that blames the name they chose. Only the empty
  // case is asked twice -- a call cut off at the ceiling would be cut
  // off again at the same ceiling, and no tool call at all means the
  // model answered something else entirely.
  if (map.problem === 'empty' && deadline - Date.now() > PLANTING_NEEDS_MS) {
    console.error(`sow: an empty map for "${subject}" (${map.diagnostic}); asking once more`)
    map = readMap(await askForMap(ASK_AGAIN))
  }

  if (map.problem) {
    // Logged in full because the browser only ever showed the sentence,
    // and a sentence with no figures behind it is a failure that can
    // only be guessed at.
    console.error(`sow: no map for "${subject}" — ${map.problem}: ${map.diagnostic}`)
  }

  return map
}

/** The model's reading of the answers, with the counts it was read
 *  from. Null when there was nothing to read, or nothing readable in
 *  what came back. */
export function readAssessment(map: MapReading, brief: Brief): Assessment | null {
  const answered = brief.qualifiers.filter(q => q.answer).length
  // A reading needs something to read. Nothing said means no verdict,
  // rather than a verdict of nought.
  const readable = answered > 0 || brief.confident.length > 0 || brief.gaps.length > 0
  const raw = map.raw.assessment

  if (!readable || !raw || !Number.isFinite(raw.level)) return null

  return {
    level: Math.min(5, Math.max(0, Math.round(raw.level!))),
    note: typeof raw.note === 'string' ? raw.note.trim() : '',
    shown: phrases(raw.shown),
    missing: phrases(raw.missing),
    answered,
    asked: brief.qualifiers.length,
  }
}

/** Whether the sheet gave the model anything to read at all. */
export function isReadable(brief: Brief): boolean {
  return (
    brief.qualifiers.some(q => q.answer) ||
    brief.confident.length > 0 ||
    brief.gaps.length > 0
  )
}

export interface Planting {
  created: Array<{ id: string; title: string }>
  /** Existing topics filed under this subject rather than duplicated. */
  linked: number
  warnings: string[]
  /** Named so the sheet can say which topics did not make it. */
  dropped: string[]
  /** Set when nothing was planted at all. The caller decides what
   *  becomes of the subject: a fresh sowing takes it away again, a
   *  bed being laid out a second time keeps standing. */
  problem: string | null
}

/**
 * Plant a map: resolve every proposal against the rest of the graph,
 * write what is new, file what already exists, and relate the bed.
 */
export async function plantMap(
  db: SupabaseClient,
  subject: { id: string; user_id: string; title: string },
  proposed: Proposal[],
  brief: Brief,
  deadline: number
): Promise<Planting> {
  const warnings: string[] = []
  const dropped: string[] = []

  // --- Resolving the proposals against the map ---------------------
  //
  // Embedding and searching used to run one topic at a time, which put
  // a twenty-topic bed well past any function timeout. They are
  // independent per topic, so they now run a few at a time; only the
  // decision that follows stays sequential, because two proposals in
  // one batch can be near-duplicates of each other and the second must
  // be able to see the first.
  //
  // A topic whose embedding cannot be got is dropped rather than
  // failing the sowing: nineteen topics and a note is a better outcome
  // than an error and nothing.
  const embedded = (
    await inBatches(proposed, CONCURRENCY, async candidate => {
      try {
        return { candidate, vector: await embedOnce(candidate.name) }
      } catch {
        dropped.push(candidate.name)
        return null
      }
    })
  ).filter(entry => entry !== null)

  if (embedded.length === 0) {
    return {
      created: [],
      linked: 0,
      warnings,
      dropped,
      problem:
        'Nothing could be embedded, so no topic could be placed on the map. The embedding function is not answering.',
    }
  }

  const searched = await inBatches(embedded, CONCURRENCY, async entry => ({
    ...entry,
    candidates: await fetchCandidates(db, entry.vector),
  }))

  const toLink: string[] = []
  const toCreate: Array<{
    name: string
    summary: string
    level: number
    vector: number[]
    pending: boolean
    chapter?: string
  }> = []

  // Which chapter ended up as which topic.
  //
  // Only filled when the bed is being laid out to the letter, and it is
  // what the document's own edges are drawn from afterwards. It has to
  // be collected here rather than worked out later because this is the
  // only point at which a proposal and the row it resolved onto are
  // both in hand -- a topic reused from elsewhere on the map keeps its
  // own name, so matching by title after the fact would miss exactly
  // the topics that matter most.
  const placed = new Map<string, string>()
  // Proposals already accepted in this pass, so the resolver can see
  // them before they exist in the database. Their ids are marked so a
  // match against one is not mistaken for a row to link.
  const accepted: Array<{ id: string; title: string; embedding: number[] }> = []

  for (const { candidate, vector, candidates } of searched) {
    // The batch's own proposals are marked as siblings so the resolver
    // can hold them to the restatement bar rather than the stranger
    // bar. They are all meant to sit in one bed together.
    const resolution = resolveConcept(
      candidate.name,
      [...candidates, ...accepted],
      vector,
      new Set(accepted.map(a => a.id))
    )

    // An existing topic keeps its own history rather than being
    // duplicated into the new subject. It is filed under this subject
    // too: exposure belongs to portrait and to landscape photography,
    // and JavaScript belongs to front-end and to app development.
    if (resolution.action === 'link') {
      // Matching something accepted moments ago means the model
      // proposed the same topic twice. There is nothing to link and
      // nothing to create; the first one stands.
      if (!resolution.topicId.startsWith('batch:')) {
        toLink.push(resolution.topicId)
        if (candidate.chapter) placed.set(candidate.chapter, resolution.topicId)
      }
      continue
    }

    toCreate.push({
      name: candidate.name,
      summary: candidate.summary,
      level: Math.min(5, Math.max(1, candidate.estimated_level)),
      vector,
      pending: resolution.action === 'pending',
      ...(candidate.chapter ? { chapter: candidate.chapter } : {}),
    })
    accepted.push({ id: `batch:${accepted.length}`, title: candidate.name, embedding: vector })
  }

  if (toLink.length > 0) {
    await db.from('topic_subjects').upsert(
      [...new Set(toLink)].map(topic_id => ({
        topic_id,
        subject_id: subject.id,
        created_by: 'ai' as const,
      })),
      { onConflict: 'topic_id,subject_id', ignoreDuplicates: true }
    )
  }

  const { data: created, error: createError } = toCreate.length
    ? await db.from('topics').insert(
        toCreate.map(t => ({
          user_id: subject.user_id,
          title: t.name,
          slug: `${t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomUUID().slice(0, 4)}`,
          summary: t.summary,
          embedding: JSON.stringify(t.vector),
          primary_subject_id: subject.id,
          state: t.pending ? 'pending' : 'active',
          created_by: 'ai' as const,
        }))
      ).select('id, title')
    : { data: [], error: null }

  if (createError) {
    return {
      created: [],
      linked: toLink.length,
      warnings,
      dropped,
      problem: `The topics could not be written: ${createError.message}`,
    }
  }

  // The chapters that became new topics, now that those rows have ids.
  if (created?.length) {
    const idByTitle = new Map(created.map(t => [t.title as string, t.id as string]))
    for (const entry of toCreate) {
      const id = entry.chapter ? idByTitle.get(entry.name) : undefined
      if (entry.chapter && id) placed.set(entry.chapter, id)
    }
  }

  const rootsNote = brief.roots !== null ? ` — roots ${brief.roots} of 5` : ''
  const evidenceNote = brief.evidence.length
    ? `, with ${brief.evidence.length} ${brief.evidence.length === 1 ? 'piece' : 'pieces'} of evidence filed`
    : ''

  // Roots of nought is a stated fact, not a missing answer: nothing has
  // been sown here, so nothing is recorded. Writing a floor exposure
  // anyway would give every topic a history it does not have and a
  // confidence it has not earned.
  if (brief.roots !== 0 && created && created.length > 0) {
    const levelFor = new Map(toCreate.map(t => [t.name, t.level]))
    // The bed exists by this point, so nothing below may fail the
    // request: an error here would send the user back to a form whose
    // work has already been done, and sowing again would duplicate it.
    // The figures are a cache over the exposure log and can be rebuilt;
    // the bed cannot be un-sown.
    try {
      // The only place a self-declared figure enters the record. It is
      // written as a real exposure so the number can still explain
      // itself, and real evidence will outweigh it.
      const { error: exposureError } = await db.from('exposures').insert(
        created.map(topic => {
          const level = levelFor.get(topic.title) ?? 1
          return {
            user_id: subject.user_id,
            topic_id: topic.id,
            source: 'manual' as const,
            depth:
              level >= 4 ? ('applied' as const) : level >= 2 ? ('read' as const) : ('skim' as const),
            ability_delta: (level / 5) * config.DEPTH_WEIGHTS.read,
            reason: `your own account when sowing "${subject.title}"${rootsNote}${evidenceNote}`,
          }
        })
      )
      if (exposureError) throw new Error(exposureError.message)
      await recomputeAbilities(db, created.map(t => t.id))
    } catch (e) {
      warnings.push(
        `the starting figures were not written: ${e instanceof Error ? e.message : String(e)}`
      )
    }
  }

  // The proof they handed over is filed against the subject it was
  // offered as evidence for, not against the topics in it.
  //
  // It used to be fanned across every topic in the bed at a low
  // relevance, which meant a twenty-topic bed printed the same book on
  // all twenty sheets -- redundant, and rarely true, since a book named
  // while sowing is about the whole subject rather than any one topic.
  // It is filed against the subject now; the reader files it onto the
  // particular topics it informs by hand. Filed whether or not any new
  // topic was created, because the subject is what it belongs to.
  const evidenceIds = brief.evidence.flatMap(e => (e.resourceId ? [e.resourceId] : []))
  if (evidenceIds.length > 0) {
    // The rung rides along with the filing: it is a fact about this
    // document's relationship to this subject, which is exactly what
    // this join row is. `ignoreDuplicates` is dropped so that laying
    // the bed out again records a rung the first attempt could not --
    // a document still being read the first time round.
    const fidelityOf = new Map(
      brief.evidence.flatMap(e => (e.resourceId && e.fidelity ? [[e.resourceId, e.fidelity]] : []))
    )
    const { error: fileError } = await db.from('resource_subjects').upsert(
      evidenceIds.map(resource_id => ({
        resource_id,
        subject_id: subject.id,
        relevance: 0.3,
        fidelity: fidelityOf.get(resource_id) ?? null,
      })),
      { onConflict: 'resource_id,subject_id' }
    )
    if (fileError) {
      warnings.push(`the evidence was not filed against the subject: ${fileError.message}`)
    }
  }

  // How the topics in this bed relate to each other.
  //
  // Nothing sown this way had any relationship at all: edges were only
  // ever proposed by the resource ingester, so a twenty-topic bed
  // arrived as twenty unconnected nodes and the graph could only
  // scatter them. The bed is the one moment the whole set is known at
  // once, which makes it the right place to ask what leads to what.
  //
  // A failure here loses the shape, not the bed. Twenty topics with no
  // edges is what the app did before; it is a worse map, not a broken
  // one. Which is also why it is the first thing given up when the
  // clock runs short: the bed is already written, and finishing the
  // request is worth more than relating it.
  // A bed laid out to the letter already knows how its topics relate,
  // because the document said so. A section sits under its chapter and
  // one chapter comes before the next -- and asking a model to guess at
  // relationships the author already stated would be both slower and
  // worse. So the document's edges are drawn, and the model's edge pass
  // is skipped entirely: it is the single most expensive thing in this
  // request, and the whole point of this rung is that the shape is not
  // up for discussion.
  const toTheLetter = brief.sources.find(
    source => source.fidelity === 'verbatim' && source.chapters.length > 0
  )

  if (toTheLetter && placed.size > 1) {
    const edges = bedEdgesFromOutline(flattenChapters(toTheLetter.chapters), placed)
    if (edges.length > 0) {
      const { error: edgeError } = await db.from('edges').upsert(
        edges.map(e => ({
          user_id: subject.user_id,
          from_topic: e.from,
          to_topic: e.to,
          kind: e.kind,
          weight: e.weight,
          created_by: 'ai' as const,
        })),
        { onConflict: 'from_topic,to_topic,kind', ignoreDuplicates: true }
      )
      if (edgeError) {
        warnings.push(
          `the bed follows the document but its connections were not drawn: ${edgeError.message}`
        )
      }
    }
  } else if (created && created.length > 1) {
    if (deadline - Date.now() < EDGES_NEED_MS) {
      warnings.push(
        'there was not enough time left to relate the topics to each other, so the bed is sown but its connections are not drawn'
      )
    } else {
      try {
        // What the new bed can attach to, on the rest of the map.
        //
        // Offering only the topics this sowing reused verbatim meant a
        // new bed could only ever connect to itself: "Options Trading"
        // would never be told that "Risk, Volatility and Return
        // Measurement" already exists one subject over, and would float
        // as an island. Subjects overlap heavily -- that is the premise
        // of one map rather than several -- so the neighbours offered
        // are the nearest existing topics by embedding, which is the
        // same search the resolver already ran per topic on the way in.
        const newIds = new Set(created.map(t => t.id))
        const nearest = neighboursFor(searched, newIds, EDGE_NEIGHBOURS)

        // Anything reused verbatim is a neighbour whether or not the
        // vector search surfaced it: the bed is already standing on it.
        const byId = new Map(nearest.map(n => [n.id, n.title]))
        for (const id of new Set(toLink)) if (!byId.has(id)) byId.set(id, '')

        const unnamed = [...byId].filter(([, title]) => !title).map(([id]) => id)
        if (unnamed.length) {
          const { data: titles } = await db.from('topics').select('id, title').in('id', unnamed)
          for (const t of titles ?? []) byId.set(t.id, t.title)
        }

        await drawConnections(
          db,
          subject.user_id,
          created.map(t => ({ id: t.id, title: t.title })),
          [...byId].filter(([, title]) => title).map(([id, title]) => ({ id, title }))
        )
      } catch (e) {
        warnings.push(
          `the bed was sown but its topics were not related to each other: ${
            e instanceof Error ? e.message : String(e)
          }`
        )
      }
    }
  }

  if (dropped.length > 0) {
    warnings.push(
      `${dropped.length} could not be placed on the map: ${dropped.join(', ')}`
    )
  }

  return {
    created: created ?? [],
    linked: toLink.length,
    warnings,
    dropped,
    problem:
      (created?.length ?? 0) === 0 && toLink.length === 0
        ? 'Nothing could be sown for that subject.'
        : null,
  }
}

/**
 * Ask what leads to what, and write the answer.
 *
 * Drawn separately from the sowing because the sowing is not the only
 * moment it can happen. A bed laid out against a short clock gives the
 * edge pass up to finish the request, and a bed that lost it that way
 * is a bed of unconnected nodes until something asks again -- which is
 * what the sheet's own button now does.
 *
 * Written with the unique key rather than a plain insert: asking twice
 * over a bed that is already half related is an ordinary thing to do
 * here, and the second answer will repeat some of the first. The count
 * that comes back is what was actually new.
 */
export async function drawConnections(
  db: SupabaseClient,
  userId: string,
  topics: Array<{ id: string; title: string }>,
  neighbours: Array<{ id: string; title: string }>
): Promise<number> {
  const edges = await proposeEdges(topics, neighbours)
  if (edges.length === 0) return 0

  const { data, error } = await db.from('edges').upsert(
    edges.map(e => ({
      user_id: userId,
      from_topic: e.from,
      to_topic: e.to,
      kind: e.kind,
      weight: e.weight,
      created_by: 'ai' as const,
    })),
    { onConflict: 'from_topic,to_topic,kind', ignoreDuplicates: true }
  ).select('id')

  if (error) throw new Error(error.message)
  return data?.length ?? 0
}

/**
 * The nearest existing topics to a bed that is already planted.
 *
 * The sowing gets these for nothing: it has just run a similarity
 * search per topic on the way in, and the neighbours fall out of it.
 * A bed being related after the fact has no such search behind it, so
 * it runs one -- from the embeddings the topics already carry, which
 * is why this costs searches rather than embeddings.
 */
export async function neighboursOfBed(
  db: SupabaseClient,
  bed: Array<{ id: string; title: string; embedding: number[] }>,
  limit = EDGE_NEIGHBOURS
): Promise<Array<{ id: string; title: string }>> {
  const searched = await inBatches(bed, CONCURRENCY, async topic => ({
    vector: topic.embedding,
    candidates: await fetchCandidates(db, topic.embedding),
  }))

  return neighboursFor(searched, new Set(bed.map(t => t.id)), limit).map(n => ({
    id: n.id,
    title: n.title,
  }))
}
