import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'
import { embed } from '@/lib/embedding'
import { resolveConcept, fetchCandidates } from '@/lib/resolver'
import { recomputeAbilities } from '@/lib/scoring'
import { config } from '@/lib/config'
import { ownerId } from '@/lib/auth'

/**
 * Laying out a bed is an LLM call, one embedding per topic and a
 * similarity search per topic, so it is the longest request the app
 * makes. The platform default cuts it off part way through, and what
 * reaches the browser is an empty body rather than an answer.
 *
 * Sixty seconds rather than more: it is the ceiling on the cheapest
 * plan, and asking for more than the plan allows is refused at deploy
 * rather than granted at runtime.
 */
export const maxDuration = 60

/** Embeddings and similarity searches run in parallel, but only a few
 *  at a time. The embedding function holds a model in memory per
 *  instance, and six at once finds its limits rather than its speed. */
const CONCURRENCY = 3

const PLATE_INKS = ['#b8482a', '#2f5233', '#c8871a', '#2a4a7c', '#6b3550', '#6b7233']

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

interface Qualifier {
  prompt: string
  level: number
  /** What a good answer shows. Written when the question was, never
   *  shown to the user, and used here as the rubric to mark against. */
  probes: string
  answer: string
}

interface Evidence {
  resourceId?: string
  title: string
  kind: string
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

export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('subjects').select('id, title, colour').order('title')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ subjects: data })
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
function buildBrief(input: {
  roots: number | null
  confident: string
  gaps: string
  qualifiers: Qualifier[]
  evidence: Evidence[]
}) {
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

/**
 * Anything thrown below this point used to reach the browser as a bare
 * 500 with no body, which is how "Failed with 500." came to be the most
 * detailed thing the app could say about its longest and most fragile
 * request. A thrown error is now answered with what it said.
 */
export async function POST(req: Request) {
  try {
    return await sow(req)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Could not lay out the bed: ${message}` }, { status: 500 })
  }
}

async function sow(req: Request) {
  const body = await req.json()
  const subject: string = typeof body.subject === 'string' ? body.subject.trim() : ''
  if (!subject) return NextResponse.json({ error: 'subject is required' }, { status: 400 })

  // Things that went wrong without being worth failing over, and topics
  // that could not be placed. Both are reported rather than hidden.
  const warnings: string[] = []
  const dropped: string[] = []

  // The owner of everything written below, taken from the session
  // rather than from the request body.
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  // Everything below the subject name is optional, so each field is
  // normalised to something printable rather than trusted.
  const roots =
    typeof body.roots === 'number' && Number.isFinite(body.roots)
      ? Math.min(5, Math.max(0, Math.round(body.roots)))
      : null
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const confident = text(body.confident)
  const gaps = text(body.gaps)
  const depth = text(body.depth)

  const rawQualifiers: unknown[] = Array.isArray(body.qualifiers) ? body.qualifiers : []
  const qualifiers: Qualifier[] = rawQualifiers
    .filter((q): q is Record<string, unknown> => typeof q === 'object' && q !== null)
    .map(q => ({
      prompt: text(q.prompt),
      level: typeof q.level === 'number' ? Math.min(5, Math.max(1, Math.round(q.level))) : 3,
      probes: text(q.probes),
      answer: text(q.answer),
    }))
    .filter(q => q.prompt)

  const rawEvidence: unknown[] = Array.isArray(body.evidence) ? body.evidence : []
  const evidence: Evidence[] = rawEvidence
    .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
    .map(e => ({
      resourceId: typeof e.resourceId === 'string' ? e.resourceId : undefined,
      title: text(e.title),
      kind: text(e.kind) || 'note',
    }))
    .filter(e => e.title)

  // Only one key is needed now: the topics are proposed by Anthropic,
  // and embedding runs on the edge function with no key at all.
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not set, so a bed cannot be laid out yet.' },
      { status: 503 }
    )
  }

  const answeredCount = qualifiers.filter(q => q.answer).length
  // A reading needs something to read. Nothing said means no verdict,
  // rather than a verdict of nought.
  const readable = answeredCount > 0 || confident.length > 0 || gaps.length > 0

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const brief = buildBrief({ roots, confident, gaps, qualifiers, evidence })

  const res = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 4000,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'record_subject_topics' },
    messages: [{
      role: 'user',
      content: `Break the subject "${subject}" into learnable topics. Topics are areas within the subject; they need not relate to one another. Use canonical names that would match an existing knowledge graph.

${scopeInstruction(depth)}

${brief ? `What they told us about where they stand:\n\n${brief}` : 'They said nothing about where they stand, so assume nothing.'}

Estimate a starting level of 1-5 per topic${
        roots !== null ? `, anchored on their own figure of ${roots}` : ''
      }. Vary it: what they named as solid should sit above what they named as a gap, and a topic nobody mentioned sits at the anchor or below. Be conservative throughout — this is a low-confidence prior that real evidence will overwrite.${
        roots === 0
          ? ' They have said outright that they have no prior knowledge, so every level is 1.'
          : ''
      }

${
  readable
    ? `Then give the assessment: your own reading of where they stand, judged from what they wrote rather than from what they claimed. Mark the answers as a knowledgeable person would — a correct but thin answer at rung 1 is not the same as a fluent one at rung 4, and a confident wrong answer counts against. Say plainly where the answers were vague or absent. This is printed back to them beside their own figure, so it must be specific enough to argue with.`
    : 'They gave nothing to read, so omit the assessment entirely.'
}`,
    }],
  })

  const tool = res.content.find(c => c.type === 'tool_use')
  if (!tool || tool.type !== 'tool_use') {
    return NextResponse.json({ error: 'no structured output' }, { status: 502 })
  }

  // A tool call cut off at the token ceiling still arrives as a
  // tool_use block, but its input is whatever parsed out of half a
  // JSON document -- topics as a bare string, or absent. Reading that
  // as a list is where "(k.topics ?? []).filter is not a function"
  // came from. The cause is named here rather than discovered in a
  // stack trace.
  if (res.stop_reason === 'max_tokens') {
    return NextResponse.json(
      {
        error:
          'The map came back half-written: the model hit its length ceiling part way through the list. Try a shallower scope, or a subject cut into two.',
      },
      { status: 502 }
    )
  }

  const raw = tool.input as {
    topics?: Array<{ name?: string; summary?: string; estimated_level?: number }>
    assessment?: { level?: number; note?: string; shown?: unknown; missing?: unknown }
  }

  // The model's shape is a promise, not a guarantee. Anything without a
  // usable name cannot be embedded or resolved, so it is dropped rather
  // than crashing the request.
  const proposed = (Array.isArray(raw.topics) ? raw.topics : [])
    .filter(t => typeof t?.name === 'string' && t.name.trim().length > 0)
    .map(t => ({
      name: t.name!.trim(),
      summary: typeof t.summary === 'string' ? t.summary : '',
      estimated_level: Number.isFinite(t.estimated_level) ? t.estimated_level! : 1,
    }))

  if (proposed.length === 0) {
    return NextResponse.json(
      { error: 'The map came back empty. Try naming the subject differently.' },
      { status: 502 }
    )
  }

  const assessment =
    readable && raw.assessment && Number.isFinite(raw.assessment.level)
      ? {
          level: Math.min(5, Math.max(0, Math.round(raw.assessment.level!))),
          note: typeof raw.assessment.note === 'string' ? raw.assessment.note.trim() : '',
          shown: phrases(raw.assessment.shown),
          missing: phrases(raw.assessment.missing),
          answered: answeredCount,
          asked: qualifiers.length,
        }
      : null

  const db = supabaseAdmin()
  const { data: existing } = await db.from('subjects').select('id')
  const colour = PLATE_INKS[(existing?.length ?? 0) % PLATE_INKS.length]

  const { data: row, error: subjectError } = await db.from('subjects')
    .insert({ user_id: userId, title: subject, colour })
    .select('id, user_id').single()
  if (subjectError) {
    return NextResponse.json({ error: subjectError.message }, { status: 500 })
  }

  // What the figures below rest on, kept so they can be read back. A
  // failure here loses the account but not the bed, so it does not
  // abort the sowing -- but it is reported rather than swallowed,
  // because the usual cause is a migration that has not been applied
  // and the symptom otherwise is a reading sheet that is silently
  // always empty.
  const { error: sowingError } = await db.from('subject_sowings').insert({
    subject_id: row!.id,
    user_id: row!.user_id,
    roots,
    confident: confident || null,
    gaps: gaps || null,
    depth: depth || null,
    qualifiers,
    evidence,
    assessed_level: assessment?.level ?? null,
    assessment,
  })
  if (sowingError) warnings.push(`the sowing record was not kept: ${sowingError.message}`)

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
    await db.from('subjects').delete().eq('id', row!.id)
    return NextResponse.json(
      {
        error:
          'Nothing could be embedded, so no topic could be placed on the map. The embedding function is not answering.',
      },
      { status: 502 }
    )
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
  }> = []
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
      if (!resolution.topicId.startsWith('batch:')) toLink.push(resolution.topicId)
      continue
    }

    toCreate.push({
      name: candidate.name,
      summary: candidate.summary,
      level: Math.min(5, Math.max(1, candidate.estimated_level)),
      vector,
      pending: resolution.action === 'pending',
    })
    accepted.push({ id: `batch:${accepted.length}`, title: candidate.name, embedding: vector })
  }

  if (toLink.length > 0) {
    await db.from('topic_subjects').upsert(
      [...new Set(toLink)].map(topic_id => ({
        topic_id,
        subject_id: row!.id,
        created_by: 'ai' as const,
      })),
      { onConflict: 'topic_id,subject_id', ignoreDuplicates: true }
    )
  }

  const { data: created, error: createError } = toCreate.length
    ? await db.from('topics').insert(
        toCreate.map(t => ({
          user_id: row!.user_id,
          title: t.name,
          slug: `${t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomUUID().slice(0, 4)}`,
          summary: t.summary,
          embedding: JSON.stringify(t.vector),
          primary_subject_id: row!.id,
          state: t.pending ? 'pending' : 'active',
          created_by: 'ai' as const,
        }))
      ).select('id, title')
    : { data: [], error: null }

  if (createError) {
    // Nothing was written, so the empty subject goes with it rather
    // than printing on the stock list as a bed with nothing in it.
    await db.from('subjects').delete().eq('id', row!.id)
    return NextResponse.json(
      { error: `The topics could not be written: ${createError.message}` },
      { status: 500 }
    )
  }

  const rootsNote = roots !== null ? ` — roots ${roots} of 5` : ''
  const evidenceNote = evidence.length
    ? `, with ${evidence.length} ${evidence.length === 1 ? 'piece' : 'pieces'} of evidence filed`
    : ''

  // Roots of nought is a stated fact, not a missing answer: nothing has
  // been sown here, so nothing is recorded. Writing a floor exposure
  // anyway would give every topic a history it does not have and a
  // confidence it has not earned.
  if (roots !== 0 && created && created.length > 0) {
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
            user_id: row!.user_id,
            topic_id: topic.id,
            source: 'manual' as const,
            depth:
              level >= 4 ? ('applied' as const) : level >= 2 ? ('read' as const) : ('skim' as const),
            ability_delta: (level / 5) * config.DEPTH_WEIGHTS.read,
            reason: `your own account when sowing "${subject}"${rootsNote}${evidenceNote}`,
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

  // An empty subject is worse than no subject: it would print on the
  // stock list as a bed with nothing in it.
  if ((created?.length ?? 0) === 0 && toLink.length === 0) {
    await db.from('subjects').delete().eq('id', row!.id)
    return NextResponse.json(
      { error: 'Nothing could be sown for that subject.' },
      { status: 502 }
    )
  }

  if (dropped.length > 0) {
    warnings.push(
      `${dropped.length} could not be placed on the map: ${dropped.join(', ')}`
    )
  }

  return NextResponse.json({
    subjectId: row!.id,
    topicsCreated: created?.length ?? 0,
    linked: toLink.length,
    // Where to send them next: a reading exists only when they gave the
    // app something to read.
    reading: assessment !== null,
    warnings,
  })
}
