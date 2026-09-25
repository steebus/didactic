import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { foldInto, isAskContext } from '@didactic/core/ask'
import { blockPromptSection } from '@didactic/core/blocks'
import { NO_THINKING } from '@/lib/llm/thinking'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'

/**
 * Drop what folding changed.
 *
 * The lesson body is read through the topic sheet that lists it, so the
 * topics tag is what carries a rewritten lesson to the reader.
 */
function dropCache() {
  revalidateTag(tags.topics, 'max')
}

/**
 * Turn a discussion into a section of the lesson it happened in.
 *
 * Asked for explicitly; never something that happens because a
 * conversation ended. The model writes the prose and `foldInto` decides
 * where it goes -- and that second half is pure and lives in
 * `packages/core`, because it is the part that can lose a lesson.
 *
 * A finished lesson is only rewritten when `regenerate` blanks it, so a
 * folded section persists in ordinary use. That one case is what the
 * warning on the body route is for.
 */
export const maxDuration = 60

const MAX_TOKENS = 1500

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const db = supabaseAdmin()

  const { data: conversation } = await db
    .from('conversations')
    .select('id, user_id, lesson_id, context')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()

  if (!conversation) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (!conversation.lesson_id) {
    return NextResponse.json({ error: 'not a lesson conversation' }, { status: 400 })
  }

  const context = isAskContext(conversation.context)
    ? conversation.context
    : { route: 'lesson' as const }

  const { data: messages } = await db
    .from('messages')
    .select('role, content')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })

  const said = (messages ?? []).filter(m => m.role === 'user' || m.role === 'assistant')
  if (!said.length) return NextResponse.json({ error: 'nothing was said' }, { status: 400 })

  const transcript = said
    .map(m => `${m.role === 'user' ? 'Reader' : 'Tutor'}: ${m.content}`)
    .join('\n\n')

  const { data: lesson } = await db
    .from('lessons')
    .select('body')
    .eq('id', conversation.lesson_id)
    .single()

  if (!lesson?.body) return NextResponse.json({ error: 'the lesson has no body' }, { status: 400 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'the model cannot be reached' }, { status: 503 })
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const reply = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: MAX_TOKENS,
    thinking: NO_THINKING,
    system: `Rewrite a conversation as one section of the lesson it happened in.

Write it as the lesson is written: prose addressed to a reader, not a transcript, with no mention of a conversation, of a question having been asked, or of a tutor. Begin with a "## " heading. Keep only what earns its place.

${blockPromptSection()}`,
    messages: [{ role: 'user', content: transcript }],
  })

  const section = reply.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim()

  if (!section) return NextResponse.json({ error: 'nothing was written' }, { status: 502 })

  const folded = foldInto(lesson.body, context.sectionId, section)
  const { error } = await db
    .from('lessons')
    .update({ body: folded })
    .eq('id', conversation.lesson_id)

  if (error) return NextResponse.json({ error: 'the lesson could not be written' }, { status: 500 })

  dropCache()
  return NextResponse.json({ ok: true })
}
