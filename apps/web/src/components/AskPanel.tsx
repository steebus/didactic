'use client'

import { useEffect, useRef, useState } from 'react'
import { didactic } from '@didactic/api'
import { acceptedSentence, stageLine } from '@didactic/core/ask'
import type { AskContext, AskStage, Proposal, AgentWrite } from '@didactic/core/ask'
import { Prose } from './Prose'
import styles from './Ask.module.css'

const api = didactic()

/** The longest the panel's leaving can take; see `leave`. */
const LEAVE_MS = 400

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

export function AskPanel({
  context,
  start,
  shelf = false,
  onShelf,
  onConversation,
  onClose,
}: {
  context: AskContext
  /** A conversation to carry on, picked from the drawer; none is a new
   *  question. The panel is mounted afresh for each one. */
  start?: string
  /** Whether the drawer of what was asked here is out. */
  shelf?: boolean
  /** Bring the drawer out; absent where the page has no list to show. */
  onShelf?: () => void
  /** Told which conversation this is once it has one, so the drawer can
   *  mark it. */
  onConversation?: (id: string | undefined) => void
  onClose: () => void
}) {
  const [lines, setLines] = useState<Line[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(Boolean(start))
  const [conversationId, setConversationId] = useState<string | undefined>()
  const [undone, setUndone] = useState<Set<string>>(new Set())
  const [folded, setFolded] = useState(false)
  const [drawing, setDrawing] = useState(false)
  // Where the turn has got to, as the route reports it: one line,
  // rewritten in place, never a log.
  const [stage, setStage] = useState<AskStage | null>(null)
  // Adding to the lesson: the button says so while it is written, the
  // panel leaves, and only then does the lesson show what went in.
  const [folding, setFolding] = useState(false)
  // On its way out, and what to do once it has gone.
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  // A conversation picked up from the drawer brings the passage it was
  // asked about, which may not be the one chosen now.
  const [quote, setQuote] = useState(context.quote)
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

  // A conversation picked from the drawer is read in before anything is
  // asked of it.
  useEffect(() => {
    if (!start) return
    let live = true
    void api.ask.read(start).then(({ ok, body }) => {
      if (!live) return
      if (ok) {
        setConversationId(start)
        setLines(body.messages.map(m => ({ role: m.role, content: m.content })))
        setQuote(body.context.quote)
        setFolded(body.folded)
      }
      setBusy(false)
    })
    return () => {
      live = false
    }
  }, [start])

  useEffect(() => {
    onConversation?.(conversationId)
  }, [conversationId]) // eslint-disable-line react-hooks/exhaustive-deps

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
    setStage('thinking')
    const { ok, body } = await api.ask.sayLive({ conversationId, message, context }, setStage)
    setStage(null)
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

  /** Close the way it opened, then do what was pressed -- once, on the
   *  animation's end or, where motion is off and there is no animation
   *  to end, a moment later regardless. */
  const left = useRef(false)
  function leave(then: () => void = onClose) {
    left.current = false
    const once = () => {
      if (left.current) return
      left.current = true
      then()
    }
    setLeaving(() => once)
    window.setTimeout(once, LEAVE_MS)
  }

  /**
   * Write the conversation into the lesson.
   *
   * It takes a few seconds -- the discussion is rewritten as lesson
   * prose -- and pressing it used to say "Added" at once while nothing
   * visibly happened. Now the button says it is adding, the panel goes
   * when it is done, and the lesson is told only after that, so what went
   * in is shown arriving on a page with nothing in front of it.
   */
  async function fold() {
    if (!conversationId || folding) return
    setFolding(true)
    const { ok, body } = await api.ask.fold(conversationId)
    setFolding(false)
    if (!ok) return
    setFolded(true)
    leave(() => {
      onClose()
      // The sheet holds its body in state, so it is told to read it
      // again, and what went in, so it can show it arriving.
      window.dispatchEvent(
        new CustomEvent('didactic:lesson-changed', { detail: { section: body?.section } })
      )
    })
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
    <div
      ref={panel}
      className={`${styles.panel} ${leaving ? styles.leaving : ''}`}
      role="dialog"
      aria-label="Ask about this"
      onAnimationEnd={e => {
        if (e.target === e.currentTarget) leaving?.()
      }}
    >
      <div className={styles.head}>
        <span className={styles.where}>
          {quote
            ? 'About the passage you chose'
            : context.title
              ? `About ${context.title}`
              : 'Ask about this'}
        </span>
        <span className={styles.headActions}>
          {onShelf && (
            <button
              type="button"
              className={styles.shelfButton}
              onClick={onShelf}
              aria-expanded={shelf}
            >
              Asked here
            </button>
          )}
          <button type="button" className={styles.close} onClick={() => leave()} aria-label="Close">
            ✕
          </button>
        </span>
      </div>

      <div ref={log} className={styles.log}>
        {quote && <blockquote className={styles.quote}>{quote}</blockquote>}

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

        {busy && <p className={styles.thinking} role="status">{drawing ? 'Drawing the picture…' : stageLine(stage)}</p>}
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
          disabled={folded || folding || busy}
          aria-busy={folding}
          onClick={fold}
        >
          {folding ? 'Adding it to the lesson…' : folded ? 'In the lesson' : 'Add this to the lesson'}
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
