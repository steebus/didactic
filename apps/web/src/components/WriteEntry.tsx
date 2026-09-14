'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { didactic } from '@didactic/api'
import { NoteEditor } from './NoteEditor'
import { useBench } from './Bench'
import styles from './WriteEntry.module.css'

const api = didactic()

/**
 * Writing an entry, from wherever you are standing.
 *
 * The one control in the catalogue that is on every sheet and is not a
 * way to another sheet. It sits in the running head because that is
 * where this world keeps its chrome -- a floating button over the paper
 * would be the only thing in the build not printed on the sheet -- and
 * it is set apart from the sheets by a rule, the way leaving is,
 * because it is an action rather than a place.
 *
 * What it opens is not a modal. The catalogue has no modals: the
 * composer unrolls under the head, on the sheet's own paper, and the
 * page carries on existing underneath it. Nothing is dimmed and nothing
 * is trapped.
 */
export function WriteEntry({
  filedUnder,
}: {
  /** The topic the sheet this is printed on is about, if it is about
   *  one. An entry written from here starts filed under it. */
  filedUnder?: { id: string; title: string }
}) {
  const router = useRouter()
  const { start } = useBench()

  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const topicId = filedUnder?.id ?? null

  /**
   * Where the composer starts: the foot of the masthead band.
   *
   * Measured rather than guessed. The band's height is its title's, and
   * that changes with the sheet, with the width, and with how many
   * lines the running head wraps to. Read once on opening, which is the
   * only moment it matters -- and from the page's own header, so a
   * sheet that prints a taller band gets a composer that starts under
   * it rather than across it.
   */
  useEffect(() => {
    if (!open) return
    const band = document.querySelector('main > header')
    const foot = band ? band.getBoundingClientRect().bottom + window.scrollY : 0
    document.body.style.setProperty('--under-band', `${Math.max(0, foot)}px`)
  }, [open])

  // Closing on Escape, because a thing that unrolls has to roll back up
  // the way everything else in this build does.
  useEffect(() => {
    if (!open) return
    const shut = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) setOpen(false)
    }
    document.addEventListener('keydown', shut)
    return () => document.removeEventListener('keydown', shut)
  }, [open, busy])

  async function keep() {
    const written = note.trim()
    if (!written || busy) return

    setBusy(true)
    setError(null)

    const { ok, body, error: failed } = await api.diary.create({ note: written, topicId })
    if (!ok || !body) {
      setError(failed ?? 'Could not keep that.')
      setBusy(false)
      return
    }

    // Kept. The sheet closes on the write rather than on the reading:
    // the entry exists, and what the app makes of it is a job the
    // reader is explicitly told they can walk away from.
    const id = body.entry.id
    setOpen(false)
    setNote('')
    setBusy(false)
    router.refresh()

    void start({ kind: 'filing', id, name: 'an entry' }, async () => {
      const read = await api.diary.read(id)
      if (!read.ok) throw new Error(read.error ?? 'Could not read that entry back.')
      router.refresh()
      // Back to the timeline, where the entry is and where what the
      // reading wrote can be taken back.
      return { href: '/marked' }
    })
  }

  return (
    <>
      <button
        type="button"
        className={styles.open}
        onClick={() => setOpen(was => !was)}
        aria-expanded={open}
        aria-controls="write-entry"
      >
        <NibIcon />
        Write an entry
      </button>

      {/* Drawn on the sheet rather than inside the running head's
          wrapping run: a panel left in that run would take whatever
          width was left at the end of the line. No mounted flag is
          needed -- nothing renders until the control is pressed, and a
          press only ever happens in a browser. */}
      {open && createPortal(
        <div id="write-entry" className={styles.composer}>
          <div className={styles.inner}>
            <p className={styles.about}>
              {/* What this is for, in the product's own words, because
                  an empty box on a sheet nobody has written one on
                  before says nothing about what belongs in it. */}
              What is sticking, what is not, what you have built with it.
              Name a topic with <span className={styles.at}>@</span> and the app
              will read this back against it.
            </p>

            {/* What the entry starts filed under, when it was opened
                from a sheet about something.

                Said out loud rather than left implicit: the entry is
                about to be filed against a topic the reader did not
                type, and a tag nobody can see is a tag nobody can
                correct. Stated as a fact rather than offered as a
                control -- it is a starting point, and naming something
                else with `@` is how it is changed. */}
            {filedUnder && (
              <p className={styles.filed}>
                <span className={styles.filedLabel}>Filed under</span>
                <span className={styles.filedName}>{filedUnder.title}</span>
              </p>
            )}

            <NoteEditor
              value={note}
              onChange={setNote}
              label="Your entry"
              placeholder="This week…"
              autoFocus
              tall
              className={styles.editor}
            />

            {error && <p className={styles.problem}>{error}</p>}

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.keep}
                onClick={keep}
                disabled={busy || !note.trim()}
              >
                {busy ? 'Keeping…' : 'Keep it'}
              </button>
              <button
                type="button"
                className={styles.quiet}
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                Not now
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

/** A nib: the catalogue's own mark for writing something down. */
function NibIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      aria-hidden="true"
      focusable="false"
      className={styles.nib}
    >
      <path
        d="M8 1.5 12.5 10a4.5 4.5 0 1 1-9 0Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M8 8.5v4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
