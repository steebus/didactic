import OpenAI from 'openai'

let client: OpenAI | null = null

/** Constructed on first use, not at module load: the SDK throws without
 *  a key, which fails the production build for every route that merely
 *  imports this file. */
function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('embed: OPENAI_API_KEY is not set')
  }
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return client
}

export async function embed(text: string): Promise<number[]> {
  if (!text.trim()) throw new Error('embed: empty text')
  const res = await getClient().embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  })
  return res.data[0].embedding
}
