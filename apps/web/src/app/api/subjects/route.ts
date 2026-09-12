import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'
import {
  proposeMap,
  plantMap,
  readAssessment,
  readTheAnswers,
  isReadable,
  loadSourceDocuments,
  PROBLEM_NOTES,
  type Brief,
  type Qualifier,
  type Evidence,
} from '@/lib/sowing'
import { isFidelity } from '@didactic/core/documents'

/**
 * Drop what this route just changed.
 *
 * The cache is only safe because every write says what it touched.
 * Erring wide is deliberate: serving a stale map is the one failure
 * this app cannot afford, and re-reading a sheet costs a few hundred
 * milliseconds once.
 */
function dropCache() {
  for (const tag of [tags.subjects, tags.topics, tags.resources, tags.pending]) revalidateTag(tag, 'max')
}


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

/**
 * The clock the sowing runs against, a few seconds inside the
 * platform's. Reaching it means giving up the edge pass and answering
 * with the bed that was written; reaching the platform's means the
 * browser is told the server gave up, which is what it was told the
 * first time this failed.
 */
export const BUDGET_MS = 54_000

const PLATE_INKS = ['#b8482a', '#2f5233', '#c8871a', '#2a4a7c', '#6b3550', '#6b7233']

export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('subjects').select('id, title, colour').order('title')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ subjects: data })
}

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
  // What the budget above is measured from.
  const deadline = Date.now() + BUDGET_MS

  const body = await req.json()
  const subject: string = typeof body.subject === 'string' ? body.subject.trim() : ''
  if (!subject) return NextResponse.json({ error: 'subject is required' }, { status: 400 })

  // Things that went wrong without being worth failing over. Reported
  // rather than hidden.
  const warnings: string[] = []

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
      ...(isFidelity(e.fidelity) ? { fidelity: e.fidelity } : {}),
    }))
    .filter(e => e.title)

  // A document only steers the bed once it has been read. One still
  // being read is dropped to plain evidence and said so, rather than
  // the bed quietly ignoring what the reader asked for.
  //
  // Only asked when something is actually being followed. The ordinary
  // sowing reaches no database at all until the map is back, which is
  // worth keeping: the model call is the part that fails, and failing
  // before writing anything is what makes a failed sowing leave no
  // half-built subject behind.
  const sources = evidence.some(e => e.fidelity)
    ? await loadSourceDocuments(supabaseAdmin(), evidence)
    : []
  for (const asked of evidence) {
    if (!asked.fidelity) continue
    const found = sources.find(s => s.resourceId === asked.resourceId)

    // Not read yet. Worth saying, and worth offering the remedy: laying
    // the bed out again once it has been read does follow it.
    if (!found) {
      warnings.push(
        `"${asked.title}" has not finished being read, so the bed was laid out without following it — lay it out again once it has`
      )
      continue
    }

    // Read, and there is nothing in it to follow. A different fact, and
    // it needs a different sentence: telling someone to wait for a
    // reading that has already happened is advice that can never pay
    // off. Nothing is lost that was ever available — the document is
    // still material, and still cited in lessons written here, which is
    // the part that does not need chapters.
    if (found.chapters.length === 0 && asked.fidelity !== 'source') {
      warnings.push(
        `"${asked.title}" has no structure that could be found — no bookmarks, no contents page, and no headings set apart from the text — so there was no order for the bed to follow. It still steers what the subject covers, and lessons written here can still cite it`
      )
    }
  }

  const brief: Brief = {
    subject,
    roots,
    confident: text(body.confident),
    gaps: text(body.gaps),
    depth: text(body.depth),
    qualifiers,
    evidence,
    sources,
  }

  // Only one key is needed now: the topics are proposed by Anthropic,
  // and embedding runs on the edge function with no key at all.
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not set, so a bed cannot be laid out yet.' },
      { status: 503 }
    )
  }

  const map = await proposeMap(brief, { assess: isReadable(brief), deadline })
  if (map.problem) {
    // The figures are named to the user as well as logged: they are the
    // one who has to decide whether to press the button again.
    return NextResponse.json(
      { error: `${PROBLEM_NOTES[map.problem]} (${map.diagnostic})` },
      { status: 502 }
    )
  }

  // The map is asked for the reading too, and on an ordinary sowing it
  // gives one. A bed laid out from a document to the letter is the case
  // where it does not: the instruction that fixes the topics crowds the
  // optional field out. So what the map did not say is asked for on its
  // own, which is the only way it arrives every time.
  const assessment =
    readAssessment(map, brief) ?? (await readTheAnswers(brief, deadline))

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
  //
  // It is also what a second attempt is laid out from: written before
  // the topics are, so a sowing that runs out of time leaves a bed the
  // sheet can offer to sow again from the same answers.
  const { error: sowingError } = await db.from('subject_sowings').insert({
    subject_id: row!.id,
    user_id: row!.user_id,
    roots,
    confident: brief.confident || null,
    gaps: brief.gaps || null,
    depth: brief.depth || null,
    qualifiers,
    evidence,
    assessed_level: assessment?.level ?? null,
    assessment,
  })
  if (sowingError) warnings.push(`the sowing record was not kept: ${sowingError.message}`)

  const planting = await plantMap(
    db,
    { id: row!.id, user_id: row!.user_id, title: subject },
    map.topics,
    brief,
    deadline
  )

  if (planting.problem) {
    // An empty subject is worse than no subject: it would print on the
    // stock list as a bed with nothing in it. Nothing has been laid out
    // from it yet either, so there is nothing to keep.
    await db.from('subjects').delete().eq('id', row!.id)
    return NextResponse.json({ error: planting.problem }, { status: 502 })
  }

  dropCache()
  return NextResponse.json({
    subjectId: row!.id,
    topicsCreated: planting.created.length,
    linked: planting.linked,
    // Where to send them next: a reading exists only when they gave the
    // app something to read.
    reading: assessment !== null,
    warnings: [...warnings, ...planting.warnings],
  })
}
