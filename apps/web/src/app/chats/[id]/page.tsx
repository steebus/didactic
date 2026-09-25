import { notFound } from 'next/navigation'
import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'
import { requireOwner } from '@/lib/auth'
import { readChat } from '@/lib/chats'
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
  const messages = await readChat(supabaseAdmin(), owner.id, id)

  if (!messages) notFound()

  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav current="chats" back={{ href: '/chats', label: 'Conversations' }} />
        <h1 className={styles.title}>A conversation</h1>
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
