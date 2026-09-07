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

  const input = tool.input as { summary: string; concepts: Array<{ name: string; relevance: number }> }
  return {
    summary: input.summary,
    concepts: input.concepts.filter(c => c.relevance >= 0 && c.relevance <= 1),
  }
}
