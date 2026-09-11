import Anthropic from '@anthropic-ai/sdk'

export async function generateRefresher(
  topic: { title: string; summary: string | null; ability: number },
  priorResources: Array<{ title: string; summary: string | null }>
) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('refresher: ANTHROPIC_API_KEY is not set')
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const res = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `Write a short refresher on "${topic.title}" for someone whose understanding is roughly ${topic.ability} out of 5. Aim for something readable in ten minutes: the core idea, the two or three things people most often forget, and one concrete example.

${priorResources.length
  ? `They previously read:\n${priorResources.map(r => `- ${r.title}${r.summary ? `: ${r.summary}` : ''}`).join('\n')}\n\nBuild on that rather than repeating it.`
  : ''}

Write prose, not a bulleted outline. No preamble.`,
    }],
  })

  const block = res.content.find(c => c.type === 'text')
  if (!block || block.type !== 'text') throw new Error('refresher: no text returned')
  return block.text
}
