import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { askTurn, READ_CEILING, type AskDeps } from '@/lib/llm/ask'
import { isAskContext } from '@didactic/core/ask'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'

/**
 * One turn of a conversation with the reader.
 *
 * A model call with tools behind it, so it is given the same minute a
 * round of a lesson gets rather than the platform's default.
 */
export const maxDuration = 60

/**
 * Drop what this route may have changed.
 *
 * Only called when the agent actually kept something: a turn that only
 * answered has moved no figure and dropping the garden for it would cost
 * every running head a re-read for nothing.
 */
function dropCache() {
  revalidateTag(tags.highlights, 'max')
  revalidateTag(tags.clozes, 'max')
}

/** What the reader is told when the model could not be reached. The
 *  conversation is kept either way, which is the point of saying it. */
const UNREACHABLE = 'That could not be answered just now. The conversation is kept; try again in a moment.'

export async function POST(req: Request) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { conversationId, message, context } = body as {
    conversationId?: string
    message?: string
    context?: unknown
  }

  if (!message || typeof message !== 'string') {
    return NextResponse.json({ error: 'no message' }, { status: 400 })
  }
  if (!isAskContext(context)) {
    return NextResponse.json({ error: 'bad context' }, { status: 400 })
  }

  const db = supabaseAdmin()

  // Start the conversation, or carry the one we have. The context is
  // stored as it stood when the question was first asked.
  let id = conversationId
  if (!id) {
    const { data, error } = await db
      .from('conversations')
      .insert({
        user_id: userId,
        kind: 'ask',
        lesson_id: context.route === 'lesson' ? (context.entityId ?? null) : null,
        // `node_id` is the topic column, under the name 012 left it.
        node_id: context.route === 'topic' ? (context.entityId ?? null) : null,
        context,
      })
      .select('id')
      .single()
    if (error || !data) {
      return NextResponse.json({ error: 'could not start the conversation' }, { status: 500 })
    }
    id = data.id
  } else {
    // A conversation carried from the client is checked against its
    // owner: the id is the only thing naming it, and it arrives from a
    // browser.
    const { data: mine } = await db
      .from('conversations')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle()
    if (!mine) return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const { data: past } = await db
    .from('messages')
    .select('role, content')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })

  const history = (past ?? [])
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  const lessonId = context.route === 'lesson' ? context.entityId : undefined

  const deps: AskDeps = {
    addMark: async (quote, note) => {
      if (!lessonId) throw new Error('a mark belongs to a lesson, and this is not one')
      const { data, error } = await db
        .from('highlights')
        .insert({ user_id: userId, lesson_id: lessonId, quote, prefix: null, note })
        .select('id')
        .single()
      if (error || !data) throw new Error('the mark could not be kept')
      return { id: data.id }
    },
    addCard: async (question, answer) => {
      if (!lessonId) throw new Error('a card belongs to a lesson, and this is not one')
      // `kind: 'qa'` is not decoration: `clozes_shape` (046) requires a
      // card to carry the columns its own kind needs, and a row with no
      // kind defaults to 'cloze', which demands a passage, a blank and
      // the two offsets a question does not have.
      const { data, error } = await db
        .from('clozes')
        .insert({
          user_id: userId,
          lesson_id: lessonId,
          kind: 'qa',
          question,
          answer,
          created_by: 'ai',
        })
        .select('id')
        .single()
      if (error || !data) throw new Error('the card could not be kept')
      return { id: data.id }
    },
    readLesson: async section => {
      if (!lessonId) return ''
      const { data } = await db.from('lessons').select('body').eq('id', lessonId).single()
      const text: string = data?.body ?? ''
      if (!section) return text.slice(0, READ_CEILING)
      const from = text.indexOf(section)
      return from === -1 ? text.slice(0, READ_CEILING) : text.slice(from, from + READ_CEILING)
    },
    searchMap: async query => {
      const { data } = await db
        .from('topics')
        .select('id, title')
        .eq('user_id', userId)
        .ilike('title', `%${query}%`)
        .limit(10)
      return (data ?? []).map(t => ({ id: t.id, name: t.title }))
    },
  }

  let turn
  try {
    turn = await askTurn({ context, history, message, deps })
  } catch (e) {
    // No key, no gateway, or a call that failed. The conversation is
    // kept and says so, rather than the reader losing what they typed --
    // the same posture `settleWithReading` takes in falling back.
    await db.from('messages').insert([
      { conversation_id: id, role: 'user', content: message },
      { conversation_id: id, role: 'assistant', content: UNREACHABLE },
    ])
    return NextResponse.json({
      conversationId: id,
      text: UNREACHABLE,
      proposals: [],
      writes: [],
      warning: e instanceof Error ? e.message : 'the model could not be reached',
    })
  }

  await db.from('messages').insert([
    { conversation_id: id, role: 'user', content: message },
    {
      conversation_id: id,
      role: 'assistant',
      content: turn.text,
      proposals: [...turn.proposals, ...turn.writes],
    },
  ])

  if (turn.writes.length) dropCache()

  return NextResponse.json({
    conversationId: id,
    text: turn.text,
    proposals: turn.proposals,
    writes: turn.writes,
  })
}
