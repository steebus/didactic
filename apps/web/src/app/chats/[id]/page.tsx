import { notFound } from 'next/navigation'
import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'
import { requireOwner } from '@/lib/auth'
import { readChat } from '@/lib/chats'
import type { AskOrigin } from '@didactic/core/ask'
import { SheetNav } from '@/components/SheetNav'
import { Prose } from '@/components/Prose'
import styles from '../page.module.css'

/**
 * One conversation, read back.
 *
 * Rendered through `Prose`, the component the lesson sheet draws with,
 * so a chart the agent wrote in the talk is the chart it drew at the
 * time rather than a fenced block of JSON.
 */
export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const owner = await requireOwner()
  const chat = await readChat(supabaseAdmin(), owner.id, id)

  if (!chat) notFound()
  const { messages, origin } = chat

  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav current="chats" back={{ href: '/chats', label: 'Conversations' }} />
        <h1 className={styles.title}>A conversation</h1>
        {origin && (
          <p className={styles.origin}>
            Asked from {origin.kind === 'cards' ? '' : `the ${origin.kind} `}
            <Link href={hrefOf(origin)} className={styles.originLink}>
              {origin.title}
            </Link>
          </p>
        )}
      </header>

      {messages.length === 0 ? (
        <p className={styles.standfirst}>Nothing was said in this one.</p>
      ) : (
        <div className={styles.transcript}>
          {messages.map((message, i) => (
            <div
              key={i}
              className={message.role === 'user' ? styles.saidByReader : styles.saidByTutor}
            >
              {message.role === 'user' ? (
                <p className={styles.asked}>{message.content}</p>
              ) : (
                <Prose markdown={message.content} />
              )}
            </div>
          ))}
        </div>
      )}

      <p className={styles.back}>
        <Link href="/chats">Back to every conversation</Link>
      </p>
    </main>
  )
}

/**
 * The page a conversation began on. A lesson opens at the section the
 * reader was at when they asked.
 */
function hrefOf(origin: AskOrigin): string {
  switch (origin.kind) {
    case 'lesson':
      return `/lesson/${origin.id}${origin.sectionId ? `#${origin.sectionId}` : ''}`
    case 'topic':
      return `/topics/${origin.id}`
    case 'subject':
      return `/subjects/${origin.id}`
    case 'cards':
      return '/tend'
  }
}
