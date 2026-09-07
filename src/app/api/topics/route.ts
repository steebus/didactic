import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'
import { embed } from '@/lib/embedding'
import { resolveConcept, fetchCandidates } from '@/lib/resolver'
import { recomputeAbility } from '@/lib/scoring'
import { config } from '@/lib/config'

const PLATE_INKS = ['#b8482a', '#2f5233', '#c8871a', '#2a4a7c', '#6b3550', '#6b7233']

const TOOL = {
  name: 'record_topic_graph',
  description: 'Record the subtopics of a learning area and an estimated starting level.',
  input_schema: {
    type: 'object' as const,
    properties: {
      subtopics: {
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
    required: ['subtopics'],
  },
}

export async function POST(req: Request) {
  const { topic, answers, userId } = await req.json()
  if (!topic) return NextResponse.json({ error: 'topic is required' }, { status: 400 })

  // Both keys are needed: one to propose the subtopics, one to embed
  // them so they can be resolved against subjects already sown.
  const missing = [
    !process.env.ANTHROPIC_API_KEY && 'ANTHROPIC_API_KEY',
    !process.env.OPENAI_API_KEY && 'OPENAI_API_KEY',
  ].filter(Boolean)

  if (missing.length > 0) {
    return NextResponse.json(
      { error: `${missing.join(' and ')} not set, so a bed cannot be laid out yet.` },
      { status: 503 }
    )
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const res = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 4000,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'record_topic_graph' },
    messages: [{
      role: 'user',
      content: `Break "${topic}" into 10-20 learnable subtopics. Use canonical names that would match an existing knowledge graph.

Their answers about current understanding:
${(answers ?? []).map((a: { q: string; a: string }) => `Q: ${a.q}\nA: ${a.a}`).join('\n\n')}

Estimate a starting level of 1-5 per subtopic from those answers. Be conservative: this is a low-confidence prior that real evidence will overwrite.`,
    }],
  })

  const tool = res.content.find(c => c.type === 'tool_use')
  if (!tool || tool.type !== 'tool_use') {
    return NextResponse.json({ error: 'no structured output' }, { status: 502 })
  }

  const raw = (tool.input as {
    subtopics?: Array<{ name?: string; summary?: string; estimated_level?: number }>
  }).subtopics

  // The model's shape is a promise, not a guarantee. Anything without a
  // usable name cannot be embedded or resolved, so it is dropped rather
  // than crashing the request.
  const subtopics = (raw ?? [])
    .filter(s => typeof s?.name === 'string' && s.name.trim().length > 0)
    .map(s => ({
      name: s.name!.trim(),
      summary: typeof s.summary === 'string' ? s.summary : '',
      estimated_level: Number.isFinite(s.estimated_level) ? s.estimated_level! : 1,
    }))

  if (subtopics.length === 0) {
    return NextResponse.json(
      { error: 'The map came back empty. Try naming the subject differently.' },
      { status: 502 }
    )
  }

  const db = supabaseAdmin()
  const { data: existingClusters } = await db.from('clusters').select('id')
  const colour = PLATE_INKS[(existingClusters?.length ?? 0) % PLATE_INKS.length]

  const { data: cluster, error: clusterError } = await db.from('clusters')
    .insert({ user_id: userId, title: topic, colour })
    .select('id, user_id').single()
  if (clusterError) {
    return NextResponse.json({ error: clusterError.message }, { status: 500 })
  }

  let created = 0
  let linked = 0

  for (const sub of subtopics) {
    const vector = await embed(sub.name)
    const candidates = await fetchCandidates(db, vector)
    const resolution = resolveConcept(sub.name, candidates, vector)

    // An existing subject keeps its own history rather than being
    // duplicated into the new section.
    if (resolution.action === 'link') {
      linked++
      continue
    }

    const { data: node } = await db.from('nodes').insert({
      user_id: cluster!.user_id,
      title: sub.name,
      slug: `${sub.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomUUID().slice(0, 4)}`,
      summary: sub.summary,
      embedding: JSON.stringify(vector),
      cluster_id: cluster!.id,
      state: resolution.action === 'pending' ? 'pending' : 'active',
      created_by: 'ai',
    }).select('id').single()

    if (!node) continue

    // The only place a self-declared figure enters the record. It is
    // written as a real exposure so the number can still explain itself,
    // and real evidence will outweigh it.
    const level = Math.min(5, Math.max(1, sub.estimated_level))
    await db.from('exposures').insert({
      user_id: cluster!.user_id,
      node_id: node.id,
      source: 'manual',
      depth: level >= 4 ? 'applied' : level >= 2 ? 'read' : 'skim',
      ability_delta: (level / 5) * config.DEPTH_WEIGHTS.read,
      reason: `your own estimate when adding "${topic}"`,
    })
    await recomputeAbility(db, node.id)
    created++
  }

  // An empty section is worse than no section: it would print on the
  // stock list as a bed with nothing in it.
  if (created === 0 && linked === 0) {
    await db.from('clusters').delete().eq('id', cluster!.id)
    return NextResponse.json(
      { error: 'Nothing could be sown for that subject.' },
      { status: 502 }
    )
  }

  return NextResponse.json({ clusterId: cluster!.id, nodesCreated: created, linked })
}
