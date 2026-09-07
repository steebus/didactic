// gte-small ships inside the edge runtime: no key, no network call, no
// third-party dependency. 384 dimensions.
const session = new Supabase.ai.Session('gte-small')

Deno.serve(async (req: Request) => {
  const { text } = await req.json()
  if (!text || typeof text !== 'string' || !text.trim()) {
    return new Response(JSON.stringify({ error: 'text is required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  const embedding = await session.run(text, {
    mean_pool: true,
    normalize: true,
  })

  return new Response(JSON.stringify({ embedding }), {
    headers: { 'content-type': 'application/json' },
  })
})
