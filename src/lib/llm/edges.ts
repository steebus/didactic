import Anthropic from '@anthropic-ai/sdk'
import type { EdgeKind } from '../types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const VALID_KINDS: EdgeKind[] = ['prereq', 'related', 'specialises', 'alternative']

const TOOL = {
  name: 'record_edges',
  description: 'Record typed relationships between knowledge graph nodes.',
  input_schema: {
    type: 'object' as const,
    properties: {
      edges: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'Source node id.' },
            to: { type: 'string', description: 'Target node id.' },
            kind: { type: 'string', enum: VALID_KINDS },
            weight: { type: 'number', description: '0-1 strength of the relationship.' },
          },
          required: ['from', 'to', 'kind', 'weight'],
        },
      },
    },
    required: ['edges'],
  },
}

export async function proposeEdges(
  newNodes: Array<{ id: string; title: string }>,
  neighbours: Array<{ id: string; title: string }>
) {
  if (newNodes.length === 0) return []

  const all = [...newNodes, ...neighbours]
  const validIds = new Set(all.map(n => n.id))

  const res = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 2000,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'record_edges' },
    messages: [{
      role: 'user',
      content: `Propose relationships between these knowledge graph nodes. Only relate the NEW nodes to each other or to the EXISTING ones. Use the given ids exactly.

Kinds: prereq (A must be learned before B), related (adjacent), specialises (B is a narrower case of A), alternative (competing choice for the same job).

NEW:
${newNodes.map(n => `${n.id}: ${n.title}`).join('\n')}

EXISTING:
${neighbours.map(n => `${n.id}: ${n.title}`).join('\n')}`,
    }],
  })

  const tool = res.content.find(c => c.type === 'tool_use')
  if (!tool || tool.type !== 'tool_use') return []

  const { edges } = tool.input as { edges: Array<{ from: string; to: string; kind: string; weight: number }> }

  return edges.filter(e =>
    validIds.has(e.from) &&
    validIds.has(e.to) &&
    e.from !== e.to &&
    VALID_KINDS.includes(e.kind as EdgeKind)
  ) as Array<{ from: string; to: string; kind: EdgeKind; weight: number }>
}
