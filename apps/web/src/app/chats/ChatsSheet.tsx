'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { groupChats, type ChatOrder } from '@didactic/core/ask'
import type { ChatSummary } from '@/lib/chats'
import styles from './page.module.css'

/**
 * The pile of old conversations, gathered and shut.
 *
 * Sections start closed except the first, because the point of a pile
 * this size is to scan the headings and open one -- a page that opens
 * everything is the flat list this exists to improve on.
 */
export function ChatsSheet({ chats, order }: { chats: ChatSummary[]; order: ChatOrder }) {
  const groups = useMemo(() => groupChats(chats, order), [chats, order])
  const [shut, setShut] = useState<Set<string>>(() => new Set(groups.slice(1).map(g => g.key)))

  if (!chats.length) return null

  return (
    <>
      <div className={styles.toggle} role="group" aria-label="How to arrange them">
        <Link
          href="/chats"
          className={order === 'date' ? styles.toggleHere : styles.toggleOther}
          aria-current={order === 'date' ? 'true' : undefined}
        >
          By date
        </Link>
        <Link
          href="/chats?by=subject"
          className={order === 'subject' ? styles.toggleHere : styles.toggleOther}
          aria-current={order === 'subject' ? 'true' : undefined}
        >
          By subject
        </Link>
      </div>

      {groups.map(group => {
        const open = !shut.has(group.key)
        return (
          <section key={group.key} className={styles.group}>
            <h2 className={styles.groupHead}>
              <button
                type="button"
                className={styles.groupButton}
                aria-expanded={open}
                onClick={() =>
                  setShut(held => {
                    const next = new Set(held)
                    if (open) next.add(group.key)
                    else next.delete(group.key)
                    return next
                  })
                }
              >
                <span className={open ? styles.markOpen : styles.markShut} aria-hidden="true">
                  ▸
                </span>
                {group.title}
                <span className={styles.groupCount}>{group.chats.length}</span>
              </button>
            </h2>

            {open && (
              <ul className={styles.list}>
                {group.chats.map(chat => (
                  <li key={chat.id} className={styles.row}>
                    <Link href={`/chats/${chat.id}`} className={styles.rowLink}>
                      <span className={styles.opening}>
                        {chat.opening || 'A conversation with nothing said in it'}
                      </span>
                      <span className={styles.about}>
                        {chat.context.title ?? 'Asked from elsewhere'}
                        {' · '}
                        <time dateTime={chat.startedAt}>
                          {new Date(chat.startedAt).toLocaleDateString(undefined, {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </time>
                      </span>
                      <Kept chat={chat} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </>
  )
}

/** What a conversation left behind, printed only where there was something. */
function Kept({ chat }: { chat: ChatSummary }) {
  const said: string[] = []
  if (chat.kept.marks) said.push(`${chat.kept.marks} mark${chat.kept.marks === 1 ? '' : 's'}`)
  if (chat.kept.cards) said.push(`${chat.kept.cards} card${chat.kept.cards === 1 ? '' : 's'}`)
  if (chat.kept.topics) said.push(`${chat.kept.topics} topic${chat.kept.topics === 1 ? '' : 's'}`)
  if (chat.folded) said.push('in the lesson')

  if (!said.length) return null
  return <span className={styles.kept}>{said.join(' · ')}</span>
}
