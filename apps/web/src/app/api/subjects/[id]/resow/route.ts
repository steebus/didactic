import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'
import {
  proposeMap,
  plantMap,
  readAssessment,
  isReadable,
  PROBLEM_NOTES,
  type Brief,
  type Qualifier,
  type Evidence,
} from '@/lib/sowing'

/** The same wide drop the sowing does: a bed appearing is a change to
 *  the stock list, to every topic sheet in it, and to the queue. The
 *  subject's own sheet is tagged with `subjects` as well as its own id,
 *  so dropping the wide tag takes it with the rest. */
function dropCache() {
  for (const tag of [tags.subjects, tags.topics, tags.pending]) revalidateTag(tag, 'max')
}

/** The same ceiling and the same budget as the first attempt: this is
 *  the same work, done again. */
export const maxDuration = 60
const BUDGET_MS = 54_000

/**
 * Lay out a bed that was sown but never planted.
 *
 * The subject row is written before its topics are, so a sowing that
 * runs out of the platform's minute part way -- during the embeddings,
 * usually -- leaves the subject standing with nothing in it. Everything
 * needed to do the work again was kept: the sowing record holds the
 * roots figure, what they said had taken and what was thin, how far
 * they wanted to go, the qualifying answers and the evidence. So the
 * remedy is not to make the user fill the sheet in a second time. It is
 * to ask again from what they already said.
 *
 * Deliberately only for an empty bed. Running this over a bed that has
 * topics in it would ask the model for the same map twice and leave the
 * resolver to sort out the collision, which is a way of making
 * duplicates rather than a way of fixing anything.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    return await resow(id)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Could not lay out the bed: ${message}` }, { status: 500 })
  }
}

async function resow(subjectId: string) {
  const deadline = Date.now() + BUDGET_MS

  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not set, so a bed cannot be laid out yet.' },
      { status: 503 }
    )
  }

  const db = supabaseAdmin()
  const { data: subject } = await db
    .from('subjects').select('id, user_id, title').eq('id', subjectId).single()
  if (!subject) return NextResponse.json({ error: 'no such subject' }, { status: 404 })

  const { count } = await db
    .from('topic_subjects')
    .select('subject_id', { count: 'exact', head: true })
    .eq('subject_id', subjectId)

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          'This bed already has topics in it. Laying it out again would propose the same map a second time; add what is missing by name instead.',
      },
      { status: 409 }
    )
  }

  const { data: sowing } = await db
    .from('subject_sowings')
    .select('roots, confident, gaps, depth, qualifiers, evidence, assessment')
    .eq('subject_id', subjectId)
    .maybeSingle()

  // A bed sown before the record existed, or one whose record did not
  // keep. There is still a subject with a name, and a name alone is
  // what the sowing sheet's own minimum is, so it lays out from that
  // rather than refusing.
  const brief: Brief = {
    subject: subject.title,
    roots: sowing?.roots === null || sowing?.roots === undefined ? null : Number(sowing.roots),
    confident: sowing?.confident ?? '',
    gaps: sowing?.gaps ?? '',
    depth: sowing?.depth ?? '',
    qualifiers: readQualifiers(sowing?.qualifiers),
    evidence: readEvidence(sowing?.evidence),
  }

  // The reading was written on the first attempt and has already been
  // shown, so it is not asked for again -- the answers have not
  // changed, and a second reading of them would only disagree with the
  // one printed in the margin. It is asked for when there is none.
  const held = sowing?.assessment ?? null
  const map = await proposeMap(brief, {
    assess: !held && isReadable(brief),
    deadline,
  })
  if (map.problem) {
    return NextResponse.json(
      { error: `${PROBLEM_NOTES[map.problem]} (${map.diagnostic})` },
      { status: 502 }
    )
  }

  const warnings: string[] = []
  const assessment = held ? null : readAssessment(map, brief)
  if (assessment) {
    const { error } = await db
      .from('subject_sowings')
      .update({ assessed_level: assessment.level, assessment })
      .eq('subject_id', subjectId)
    if (error) warnings.push(`the reading was not kept: ${error.message}`)
  }

  const planting = await plantMap(db, subject, map.topics, brief, deadline)

  if (planting.problem) {
    // The subject stands. It was here before this request and the user
    // may have filed things against it; what failed is the planting,
    // and they can press the button again.
    return NextResponse.json({ error: planting.problem }, { status: 502 })
  }

  dropCache()
  return NextResponse.json({
    topicsCreated: planting.created.length,
    linked: planting.linked,
    reading: assessment !== null || held !== null,
    warnings: [...warnings, ...planting.warnings],
  })
}

/** The qualifying set as it was stored: the model's own shape, held in
 *  jsonb, so nothing about it is guaranteed on the way back out. */
function readQualifiers(raw: unknown): Qualifier[] {
  if (!Array.isArray(raw)) return []
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  return raw
    .filter((q): q is Record<string, unknown> => typeof q === 'object' && q !== null)
    .map(q => ({
      prompt: text(q.prompt),
      level: typeof q.level === 'number' ? Math.min(5, Math.max(1, Math.round(q.level))) : 3,
      probes: text(q.probes),
      answer: text(q.answer),
    }))
    .filter(q => q.prompt)
}

function readEvidence(raw: unknown): Evidence[] {
  if (!Array.isArray(raw)) return []
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  return raw
    .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
    .map(e => ({
      resourceId: typeof e.resourceId === 'string' ? e.resourceId : undefined,
      title: text(e.title),
      kind: text(e.kind) || 'note',
    }))
    .filter(e => e.title)
}
