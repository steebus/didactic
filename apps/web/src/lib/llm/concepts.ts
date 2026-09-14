import Anthropic from '@anthropic-ai/sdk'

let client: Anthropic | null = null

/** Constructed on first use: building the SDK at module load fails the
 *  production build on any machine without a key. */
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set')
  }
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return client
}

const MAX_CHARS = 100_000

const TOOL = {
  name: 'record_concepts',
  description: 'Record the summary and the learnable concepts found in a resource.',
  input_schema: {
    type: 'object' as const,
    properties: {
      summary: { type: 'string', description: 'Two or three sentences.' },
      concepts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'A canonical subtopic name, e.g. "React Hooks".' },
            relevance: { type: 'number', description: '0-1: how central this concept is to the resource.' },
          },
          required: ['name', 'relevance'],
        },
      },
    },
    required: ['summary', 'concepts'],
  },
}

export async function extractConcepts(title: string, text: string) {
  const res = await getClient().messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 2000,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'record_concepts' },
    messages: [{
      role: 'user',
      content: `Identify the learnable concepts in this resource. Prefer canonical, reusable subtopic names over phrasings specific to this text - the names are matched against an existing knowledge graph.

Title: ${title}

${text.slice(0, MAX_CHARS)}`,
    }],
  })

  const tool = res.content.find(c => c.type === 'tool_use')
  if (!tool || tool.type !== 'tool_use') {
    throw new Error('extractConcepts: no structured output')
  }

  return readConcepts(tool.input)
}

/**
 * What came back, made safe to use.
 *
 * This was a cast -- `tool.input as { summary, concepts }` -- which
 * asserts a shape without checking one, and the shape is not always
 * what the schema asked for. Two ways it differs, both seen in
 * production on ordinary articles:
 *
 *  - `concepts` arrives as a **string** holding the JSON array rather
 *    than as the array itself. `.filter` is not a function on a string,
 *    and the throw took the whole ingestion down: the job failed, the
 *    worker retried it twice more, and the resource sat in the inbox
 *    saying nothing.
 *  - `summary` is simply absent, though the schema marks it required.
 *
 * A tool schema is a request, not a guarantee. This is the boundary
 * where model output becomes app data, so it is read rather than
 * asserted -- and one malformed field costs that field, never the
 * resource.
 */
export function readConcepts(input: unknown): {
  summary: string | null
  concepts: Array<{ name: string; relevance: number }>
} {
  const held = (input ?? {}) as Record<string, unknown>

  return {
    summary: typeof held.summary === 'string' && held.summary.trim() ? held.summary : null,
    concepts: asArray(held.concepts)
      .map(c => {
        const row = (c ?? {}) as Record<string, unknown>
        const name = typeof row.name === 'string' ? row.name.trim() : ''
        // A concept with no relevance is still a concept. Missing, it
        // is taken as squarely relevant rather than dropped: the model
        // named it, which is the part that matters.
        const relevance = typeof row.relevance === 'number' ? row.relevance : 0.5
        return { name, relevance }
      })
      .filter(c => c.name && c.relevance >= 0 && c.relevance <= 1),
  }
}

/** An array, whether it arrived as one or as JSON text holding one. */
function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}
