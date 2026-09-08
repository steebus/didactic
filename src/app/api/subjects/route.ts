import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'
import { embed } from '@/lib/embedding'
import { resolveConcept, fetchCandidates } from '@/lib/resolver'
import { recomputeAbility } from '@/lib/scoring'
import { config } from '@/lib/config'

const PLATE_INKS = ['#b8482a', '#2f5233', '#c8871a', '#2a4a7c', '#6b3550', '#6b7233']

const TOOL = {
  name: 'record_subject_topics',
  description: 'Record the topics within a subject and an estimated starting level for each.',
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

export async function POST(req: Request) {
  const { subject, answers, userId } = await req.json()
  if (!subject) return NextResponse.json({ error: 'subject is required' }, { status: 400 })

  // Only one key is needed now: the topics are proposed by Anthropic,
  // and embedding runs on the edge function with no key at all.
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not set, so a bed cannot be laid out yet.' },
      { status: 503 }
    )
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const res = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 4000,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'record_subject_topics' },
    messages: [{
      role: 'user',
      content: `Break the subject "${subject}" into 10-20 learnable topics. Topics are areas within the subject; they need not relate to one another. Use canonical names that would match an existing knowledge graph.

Their answers about current understanding:
${(answers ?? []).map((a: { q: string; a: string }) => `Q: ${a.q}\nA: ${a.a}`).join('\n\n')}

Estimate a starting level of 1-5 per topic from those answers. Be conservative: this is a low-confidence prior that real evidence will overwrite.`,
    }],
  })

  const tool = res.content.find(c => c.type === 'tool_use')
  if (!tool || tool.type !== 'tool_use') {
    return NextResponse.json({ error: 'no structured output' }, { status: 502 })
  }

  const raw = (tool.input as {
    topics?: Array<{ name?: string; summary?: string; estimated_level?: number }>
  }).topics

  // The model's shape is a promise, not a guarantee. Anything without a
  // usable name cannot be embedded or resolved, so it is dropped rather
  // than crashing the request.
  const proposed = (raw ?? [])
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

  const db = supabaseAdmin()
  const { data: existing } = await db.from('subjects').select('id')
  const colour = PLATE_INKS[(existing?.length ?? 0) % PLATE_INKS.length]

  const { data: row, error: subjectError } = await db.from('subjects')
    .insert({ user_id: userId, title: subject, colour })
    .select('id, user_id').single()
  if (subjectError) {
    return NextResponse.json({ error: subjectError.message }, { status: 500 })
  }

  let created = 0
  let linked = 0

  for (const candidate of proposed) {
    const vector = await embed(candidate.name)
    const candidates = await fetchCandidates(db, vector)
    const resolution = resolveConcept(candidate.name, candidates, vector)

    // An existing topic keeps its own history rather than being
    // duplicated into the new subject. It is filed under this subject
    // too: exposure belongs to portrait and to landscape photography,
    // and JavaScript belongs to front-end and to app development.
    if (resolution.action === 'link') {
      await db.from('topic_subjects').upsert(
        { topic_id: resolution.topicId, subject_id: row!.id, created_by: 'ai' },
        { onConflict: 'topic_id,subject_id', ignoreDuplicates: true }
      )
      linked++
      continue
    }

    const { data: topic } = await db.from('topics').insert({
      user_id: row!.user_id,
      title: candidate.name,
      slug: `${candidate.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomUUID().slice(0, 4)}`,
      summary: candidate.summary,
      embedding: JSON.stringify(vector),
      primary_subject_id: row!.id,
      state: resolution.action === 'pending' ? 'pending' : 'active',
      created_by: 'ai',
    }).select('id').single()

    if (!topic) continue

    // The only place a self-declared figure enters the record. It is
    // written as a real exposure so the number can still explain itself,
    // and real evidence will outweigh it.
    const level = Math.min(5, Math.max(1, candidate.estimated_level))
    await db.from('exposures').insert({
      user_id: row!.user_id,
      topic_id: topic.id,
      source: 'manual',
      depth: level >= 4 ? 'applied' : level >= 2 ? 'read' : 'skim',
      ability_delta: (level / 5) * config.DEPTH_WEIGHTS.read,
      reason: `your own estimate when adding "${subject}"`,
    })
    await recomputeAbility(db, topic.id)
    created++
  }

  // An empty subject is worse than no subject: it would print on the
  // stock list as a bed with nothing in it.
  if (created === 0 && linked === 0) {
    await db.from('subjects').delete().eq('id', row!.id)
    return NextResponse.json(
      { error: 'Nothing could be sown for that subject.' },
      { status: 502 }
    )
  }

  return NextResponse.json({ subjectId: row!.id, topicsCreated: created, linked })
}
