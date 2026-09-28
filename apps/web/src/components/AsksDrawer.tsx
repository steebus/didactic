'use client'

import { useEffect, useState } from 'react'
import { didactic } from '@didactic/api'
import { chatLine, type ChatSummary } from '@didactic/core/ask'
import styles from './AsksDrawer.module.css'

const api = didactic()

/**
 * Every conversation had on this page, down the right-hand side.
 *
 * The marks drawer's column and manner -- the same width, ground and
 * slide -- because it is the same kind of thing: an index to what was
 * made on this page. Pressing one opens it in the panel to be carried
 * on; the conversation in the panel now is marked, and *New question*
 * starts another.
 */
export function AsksDrawer({
  about,
  current,
  onResume,
  onFresh,
  onClose,
}: {
  about: { route: 'lesson' | 'resource' | 'topic' | 'subject'; entityId: string }
  /** The conversation open in the panel, if it has been saved yet. */
  current?: string
  onResume: (id: string) => void
  onFresh: () => void
  onClose: () => void
}) {
  const [chats, setChats] = useState<ChatSummary[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [leaving, setLeaving] = useState<null | (() => void)>(null)

  useEffect(() => {
    let live = true
    void api.ask.list(about).then(({ ok, body }) => {
      if (!live) return
      if (ok) setChats(body.chats)
      else setFailed(true)
    })
    return () => {
      live = false
    }
  }, [about.route, about.entityId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Leaves the way it came, then does what was pressed.
  const leave = (then: () => void) => setLeaving(() => then)

  return (
    <aside
      className={`${styles.drawer} ${leaving ? styles.leaving : ''}`}
      aria-label="Questions asked here"
      onAnimationEnd={() => leaving?.()}
    >
      <div className={styles.head}>
        <h2 className={styles.title}>
          Asked here {chats && <span className={styles.tally}>{chats.length}</span>}
        </h2>
        <button type="button" className={styles.close} onClick={() => leave(onClose)} aria-label="Close">
          ✕
        </button>
      </div>

      <button type="button" className={styles.fresh} onClick={() => leave(onFresh)}>
        New question
      </button>

      {failed ? (
        <p className={styles.empty}>These could not be read just now.</p>
      ) : chats === null ? (
        <p className={styles.empty}>Reading…</p>
      ) : chats.length === 0 ? (
        <p className={styles.empty}>Nothing has been asked on this page yet.</p>
      ) : (
        <ol className={styles.chats}>
          {chats.map(chat => (
            <li key={chat.id}>
              <button
                type="button"
                className={`${styles.chat} ${chat.id === current ? styles.here : ''}`}
                aria-current={chat.id === current ? 'true' : undefined}
                onClick={() => leave(() => onResume(chat.id))}
              >
                {chat.context.quote && <span className={styles.quote}>{chat.context.quote}</span>}
                <span className={styles.opening}>{chat.opening || 'A question with no words'}</span>
                <span className={styles.meta}>
                  <time dateTime={chat.startedAt}>
                    {new Date(chat.startedAt).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </time>
                  {' · '}
                  {chatLine(chat)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}
