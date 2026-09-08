/**
 * Concept embeddings, produced by gte-small running inside the Supabase
 * edge runtime. No API key, no third-party call, no per-embedding cost:
 * the model ships with the runtime and runs beside the data.
 *
 * 384 dimensions. The resolver's thresholds are calibrated to this
 * model's similarity distribution, which is compressed higher than
 * OpenAI's — see config.ts.
 */

const FUNCTIONS_URL =
  process.env.SUPABASE_FUNCTIONS_URL ??
  `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54600'}/functions/v1`

export const EMBEDDING_DIMENSIONS = 384

export async function embed(text: string): Promise<number[]> {
  if (!text.trim()) throw new Error('embed: empty text')

  const res = await fetch(`${FUNCTIONS_URL}/embed`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // The local stack runs with --no-verify-jwt; a deployed one wants
      // the anon key, which is public by design.
      ...(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        ? { authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` }
        : {}),
    },
    body: JSON.stringify({ text }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`embed: function returned ${res.status} ${detail}`.trim())
  }

  const { embedding } = (await res.json()) as { embedding?: number[] }

  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `embed: expected ${EMBEDDING_DIMENSIONS} dimensions, got ${embedding?.length ?? 'nothing'}`
    )
  }

  return embedding
}
