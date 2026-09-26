import type { SupabaseClient } from '@supabase/supabase-js'
import { askOrigin, isAskContext, type AskContext, type AskOrigin } from '@didactic/core/ask'

/**
 * Reading back the conversations a reader has had.
 *
 * A conversation is worth keeping only if it can be found again, and
 * until this existed none could: the panel started a fresh one every
 * time it opened and everything said before that was a row nobody
 * queried. This is the other half of storing them.
 */

/** A conversation as the list prints it. */
export interface ChatSummary {
  id: string
  startedAt: string
  /** What it was about, as the context recorded it. */
  context: AskContext
  /** The reader's first question, which is what names a conversation
   *  better than any title we could write for it. */
  opening: string
  /** How many turns were taken, the reader's and the agent's together. */
  said: number
  /** What it left behind: marks and cards kept, topics offered. */
  kept: { marks: number; cards: number; topics: number }
  /** Whether it has been written into its lesson. */
  folded: boolean
  /** The lesson or topic it hangs off, where there is one. */
  lessonId: string | null
  topicId: string | null
}

/** One message, as the reader of a single conversation prints it. */
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

/**
 * Count what a message's `proposals` column recorded.
 *
 * The column carries two shapes -- what the agent kept by itself and
 * what it offered -- told apart by `kind`, which is why they can share
 * one column. Anything unrecognised is ignored rather than guessed at.
 */
function tally(proposals: unknown, into: { marks: number; cards: number; topics: number }) {
  if (!Array.isArray(proposals)) return
  for (const entry of proposals) {
    const kind = (entry as { kind?: string })?.kind
    if (kind === 'mark') into.marks++
    else if (kind === 'card') into.cards++
    else if (kind === 'topic') into.topics++
  }
}

/**
 * Every conversation this reader has had, newest first.
 *
 * One query for the conversations and one for their messages, rather
 * than one per conversation: the list prints the opening question and a
 * count for each, and a page of twenty conversations should not be
 * twenty round trips to another continent.
 */
export async function readChats(db: SupabaseClient, userId: string): Promise<ChatSummary[]> {
  const { data: conversations } = await db
    .from('conversations')
    .select('id, started_at, context, lesson_id, topic_id, folded_at')
    .eq('user_id', userId)
    .eq('kind', 'ask')
    .order('started_at', { ascending: false })

  if (!conversations?.length) return []

  const { data: messages } = await db
    .from('messages')
    .select('conversation_id, role, content, proposals, created_at')
    .in(
      'conversation_id',
      conversations.map(c => c.id)
    )
    .order('created_at', { ascending: true })

  const byConversation = new Map<string, typeof messages>()
  for (const message of messages ?? []) {
    const held = byConversation.get(message.conversation_id) ?? []
    held.push(message)
    byConversation.set(message.conversation_id, held)
  }

  return conversations.map(row => {
    const said = byConversation.get(row.id) ?? []
    const kept = { marks: 0, cards: 0, topics: 0 }
    for (const message of said) tally(message.proposals, kept)

    return {
      id: row.id,
      startedAt: row.started_at,
      context: isAskContext(row.context) ? row.context : { route: 'other' },
      opening: said.find(m => m.role === 'user')?.content ?? '',
      said: said.length,
      kept,
      folded: Boolean(row.folded_at),
      lessonId: row.lesson_id,
      topicId: row.topic_id,
    }
  })
}

/** One conversation, read back: what was said, and where it began. */
export interface Chat {
  messages: ChatMessage[]
  /** The lesson, topic or subject it was asked from, where there is one. */
  origin: AskOrigin | null
}

/**
 * One conversation, in the order it was had.
 *
 * Scoped by owner through its conversation rather than by trusting the
 * id, which arrives from a browser.
 */
export async function readChat(
  db: SupabaseClient,
  userId: string,
  id: string
): Promise<Chat | null> {
  const { data: conversation } = await db
    .from('conversations')
    .select('id, context, lesson_id, topic_id')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()

  if (!conversation) return null

  const { data: messages } = await db
    .from('messages')
    .select('role, content, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })

  const context: AskContext = isAskContext(conversation.context)
    ? conversation.context
    : { route: 'other' }

  return {
    origin: askOrigin(context, {
      lessonId: conversation.lesson_id,
      topicId: conversation.topic_id,
    }),
    messages: (messages ?? [])
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        createdAt: m.created_at,
      })),
  }
}
