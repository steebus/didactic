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
    // Room for the long way round.
    //
    // Measured on a 7,000-word article: about one response in four
    // comes back with `concepts` serialised as a JSON *string* rather
    // than as an array, and the string spends several times the tokens
    // the structured form does. At 2,000 those runs hit the ceiling and
    // truncated mid-array -- the model stopped for `max_tokens`, the
    // half-written JSON would not parse, and the article was filed
    // against nothing while reporting success.
    //
    // The reading itself is a dozen short concepts and a summary; this
    // is headroom for the malformed case, not an invitation to write
    // more.
    max_tokens: 8000,
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
    throw new Error(
      `extractConcepts: no structured output (stop_reason ${res.stop_reason}, content ${res.content.map(c => c.type).join('+') || 'empty'})`
    )
  }

  const read = readConcepts(tool.input)
  // Why, kept on the result so the caller can put it in the error it
  // throws. A console.error here does not survive the serverless log
  // stream, and this is the one place the shape is still known: by the
  // time `ingest` sees an empty array, "ran out of room", "answered in
  // a shape nobody expects" and "genuinely found nothing" look alike.
  const held = (tool.input ?? {}) as Record<string, unknown>
  const why =
    `stop=${res.stop_reason} keys=${Object.keys(held).join('|') || 'none'} ` +
    `concepts=${Array.isArray(held.concepts) ? `array(${held.concepts.length})` : typeof held.concepts} ` +
    `out=${res.usage?.output_tokens ?? '?'}`

  // What came back, when what came back was nothing. Named at the point
  // it is known rather than inferred two frames up: whether the model
  // ran out of room, answered with a shape nobody expects, or genuinely
  // found nothing are three different problems with three different
  // fixes, and by the time `ingest` sees an empty array they look the
  // same.
  return { ...read, why }
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
function asArray(value: unknown, depth = 0): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []

  // Three deep is far past anything seen; it only stops a pathological
  // string from spinning.
  if (depth > 3) return []

  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed
    // Double-encoded: the array was serialised, and then that string
    // was serialised again. Parsing once yields another string, and
    // returning [] here was the bug that filed a perfectly readable
    // article against nothing while reporting success.
    if (typeof parsed === 'string') return asArray(parsed, depth + 1)
    // An object holding the array under some key of its own.
    if (parsed && typeof parsed === 'object') {
      for (const inner of Object.values(parsed as Record<string, unknown>)) {
        if (Array.isArray(inner)) return inner
      }
    }
    return salvage(value)
  } catch {
    // Truncated part way through. Ten good concepts followed by half an
    // eleventh is ten concepts, and throwing them away files the
    // resource against nothing -- which is what the reader sees as "it
    // read my article and found nothing in it".
    return salvage(value)
  }
}

/**
 * Whole objects from the front of a broken JSON array.
 *
 * Only ever reached when the model serialised its answer as a string
 * and ran out of room finishing it. Each `{...}` is taken on its own,
 * and the one that was cut off is left behind: a concept is a name and
 * a number, so a complete object is complete evidence whatever came
 * after it.
 */
function salvage(text: string): unknown[] {
  const found: unknown[] = []
  for (const [chunk] of text.matchAll(/\{[^{}]*\}/g)) {
    try {
      found.push(JSON.parse(chunk))
    } catch {
      // Not an object after all. The next one may still be.
    }
  }
  return found
}
