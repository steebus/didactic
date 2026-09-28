'use client'

import { useEffect, useRef, useState } from 'react'
import { didactic } from '@didactic/api'
import { acceptedSentence } from '@didactic/core/ask'
import type { AskContext, Proposal, AgentWrite } from '@didactic/core/ask'
import { Prose } from './Prose'
import styles from './Ask.module.css'

const api = didactic()

/**
 * The conversation itself.
 *
 * Every answer is rendered through `Prose`, which is the same component
 * the lesson sheet draws with -- so a chart the agent writes is the
 * chart a lesson would have drawn, from one registry and one dispatch.
 * That is also what makes folding cheap later: the discussion is already
 * lesson-shaped.
 */
interface Line {
  role: 'user' | 'assistant'
  content: string
  proposals?: Proposal[]
  writes?: AgentWrite[]
}

export function AskPanel({ context, onClose }: { context: AskContext; onClose: () => void }) {
  const [lines, setLines] = useState<Line[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [conversationId, setConversationId] = useState<string | undefined>()
  const [undone, setUndone] = useState<Set<string>>(new Set())
  const [folded, setFolded] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const log = useRef<HTMLDivElement>(null)

  // Publish our height, the way the bench and the mark composer do, so
  // anything docked later stands on this rather than under it.
  useEffect(() => {
    const node = panel.current
    if (!node) return
    document.documentElement.style.setProperty('--ask-panel', `${node.offsetHeight}px`)
    return () => {
      document.documentElement.style.removeProperty('--ask-panel')
    }
  }, [lines.length])

  // Keep the newest answer in view.
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight })
  }, [lines.length, busy])

  async function send() {
    const message = draft.trim()
    if (!message || busy) return
    setDraft('')
    setLines(l => [...l, { role: 'user', content: message }])
    setBusy(true)
    const { ok, body } = await api.ask.say({ conversationId, message, context })
    if (ok) {
      setConversationId(body.conversationId)
      setLines(l => [
        ...l,
        {
          role: 'assistant',
          content: body.text,
          proposals: body.proposals,
          writes: body.writes,
        },
      ])
      if (body.drawing) {
        // The answer is already on screen, and its picture prints nothing
        // until it is drawn. The drawing is its own request -- the turn's
        // minute has no room for it -- and puts the answer back with the
        // picture in, or with the reason it could not be made.
        setDrawing(true)
        const drawn = await api.ask.draw(body.conversationId)
        const text = drawn.ok
          ? drawn.body.text
          : `${body.text}\n\n*The drawing could not be made: ${drawn.error ?? 'the request failed'}.*`
        setLines(l => {
          const next = [...l]
          const last = next.length - 1
          if (next[last]?.role === 'assistant') next[last] = { ...next[last], content: text }
          return next
        })
        setDrawing(false)
      }
    } else {
      setLines(l => [
        ...l,
        { role: 'assistant', content: 'That could not be sent. Try again in a moment.' },
      ])
    }
    setBusy(false)
  }

  async function undo(write: AgentWrite) {
    if (!conversationId) return
    setUndone(u => new Set(u).add(write.id))
    const { ok } = await api.ask.undo(conversationId, { kind: write.kind, writeId: write.id })
    if (!ok) {
      // Put it back: the row is still there, and saying it is gone would
      // be worse than the failure itself.
      setUndone(u => {
        const next = new Set(u)
        next.delete(write.id)
        return next
      })
    }
  }

  return (
    <div ref={panel} className={styles.panel} role="dialog" aria-label="Ask about this">
      <div className={styles.head}>
        <span className={styles.where}>
          {context.quote
            ? 'About the passage you chose'
            : context.title
              ? `About ${context.title}`
              : 'Ask about this'}
        </span>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div ref={log} className={styles.log}>
        {context.quote && <blockquote className={styles.quote}>{context.quote}</blockquote>}

        {lines.map((line, i) => (
          <div
            key={i}
            className={line.role === 'user' ? styles.fromReader : styles.fromTutor}
          >
            {line.role === 'user' ? <p>{line.content}</p> : <Prose markdown={line.content} />}

            {line.writes?.map(write => (
              <p key={write.id} className={styles.kept}>
                {undone.has(write.id) ? (
                  <>Took back the {write.kind}.</>
                ) : (
                  <>
                    Kept a {write.kind}: <span className={styles.what}>{write.label}</span>{' '}
                    <button type="button" className={styles.undo} onClick={() => undo(write)}>
                      Undo
                    </button>
                  </>
                )}
              </p>
            ))}

            {line.proposals?.map((proposal, k) => (
              <Offered key={k} proposal={proposal} conversationId={conversationId} />
            ))}
          </div>
        ))}

        {busy && <p className={styles.thinking}>{drawing ? 'Drawing the picture…' : 'Thinking…'}</p>}
      </div>

      <div className={styles.composer}>
        <input
          className={styles.field}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          placeholder="Ask about this"
          aria-label="Ask about this"
        />
        <button type="button" className={styles.send} onClick={send} disabled={busy}>
          Ask
        </button>
      </div>

      {context.route === 'lesson' && conversationId && lines.length > 1 && (
        <button
          type="button"
          className={styles.fold}
          disabled={folded}
          onClick={async () => {
            setFolded(true)
            const { ok, body } = await api.ask.fold(conversationId)
            if (!ok) setFolded(false)
            // The sheet holds its body in state, so it is told to read
            // it again, and what went in, so it can show it arriving.
            else
              window.dispatchEvent(
                new CustomEvent('didactic:lesson-changed', { detail: { section: body?.section } })
              )
          }}
        >
          {folded ? 'Added to the lesson' : 'Add this to the lesson'}
        </button>
      )}
    </div>
  )
}

/** A topic the agent offered, and the tap that creates it. */
function Offered({
  proposal,
  conversationId,
}: {
  proposal: Proposal
  conversationId?: string
}) {
  const [state, setState] = useState<'offered' | 'adding' | 'added'>('offered')
  // What accepting it came to: it is read against the map first, and may
  // turn out to be a topic already there, or a question for the inbox.
  const [said, setSaid] = useState<string | null>(null)

  return (
    <div className={styles.proposal}>
      <strong className={styles.proposalName}>{proposal.name}</strong>
      <p className={styles.proposalSummary}>{proposal.summary}</p>
      <button
        type="button"
        className={styles.accept}
        disabled={state !== 'offered' || !conversationId}
        onClick={async () => {
          if (!conversationId) return
          setState('adding')
          const { ok, body } = await api.ask.accept(conversationId, {
            name: proposal.name,
            summary: proposal.summary,
          })
          setState(ok ? 'added' : 'offered')
          if (ok && body?.outcome) setSaid(acceptedSentence(body))
        }}
      >
        {state === 'added' ? 'Accepted' : state === 'adding' ? 'Reading it against the map…' : 'Add this topic'}
      </button>
      {said && <p className={styles.proposalSummary}>{said}</p>}
    </div>
  )
}
