'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { didactic } from '@didactic/api'
import type { VoicingStanding } from '@didactic/api/lessons'

const api = didactic()

/** How often to ask, while anything is still being made. */
const POLL_MS = 5000

/**
 * Where a list of lessons stands as recordings.
 *
 * One request for the whole route rather than one per row, and polled
 * only while something is actually being made -- a topic whose lessons
 * are all recorded, or none of them, asks once and then stops. The
 * sheet is left open for a long time, and a poll that never ends is a
 * request every five seconds for the rest of the day.
 *
 * Queueing is deliberately *not* fire-and-forget across the list. The
 * machine that voices these has two cores and does one lesson at a
 * time; asking for six at once would put six rows in the queue and
 * leave the reader watching the first for twenty minutes with no way
 * to tell which was which. They go in one at a time, each asked for as
 * the one before it finishes, so the ring that is filling is always the
 * lesson that is actually being made.
 */
export function useVoicings(lessonIds: string[]) {
  const [standing, setStanding] = useState<Record<string, VoicingStanding>>({})

  // The ids as one string, so the effect below is not restarted by a
  // new array of the same lessons on every render of the sheet.
  const key = lessonIds.join(',')

  /**
   * Lessons asked for but not yet sent, oldest first, for rendering.
   *
   * State rather than only a ref because the sheet prints how many are
   * waiting, and a ref read during a render is a number that never
   * changes on screen.
   */
  const [waiting, setWaiting] = useState<string[]>([])

  /**
   * The same line, for the poll to read.
   *
   * The state is what the sheet renders from; this is what the interval
   * reads, because an interval that depended on the state would be torn
   * down and rebuilt every time somebody pressed a control. Written
   * beside every write to the state and read only inside callbacks,
   * never during a render.
   */
  const line = useRef<string[]>([])

  const ask = useCallback(async (ids: string) => {
    if (!ids) return null
    const got = await api.lessons.voicings(ids.split(','))
    if (!got.ok) return null
    setStanding(got.body.lessons)
    return got.body.lessons
  }, [])

  useEffect(() => {
    if (!key) return
    let live = true

    const round = async () => {
      const lessons = await ask(key)
      if (!live || !lessons) return

      // Send the next one on only when nothing is being made. The
      // worker takes one at a time, so a second row in the queue buys
      // nothing and costs the reader the ability to see what is
      // happening.
      const busy = Object.values(lessons).some(
        l => l.state === 'queued' || l.state === 'voicing'
      )
      // Nothing being made and something waiting: send the next one.
      //
      // Read from the ordinary closure and removed with a plain
      // updater. An updater that also decided what to send would be a
      // side effect inside a setter, which React is free to call twice
      // -- and twice here is the same lesson queued twice.
      const next = line.current[0]
      if (!busy && next) {
        line.current = line.current.slice(1)
        setWaiting(rest => (rest[0] === next ? rest.slice(1) : rest))
        await api.lessons.listen(next)
        await ask(key)
      }
    }

    void round()

    const tick = setInterval(() => void round(), POLL_MS)
    return () => {
      live = false
      clearInterval(tick)
    }
  }, [key, ask])

  /**
   * Ask for a lesson to be read aloud.
   *
   * Sent now if nothing is being made, and queued behind whatever is
   * otherwise. Pressing the same lesson twice is not two requests: it
   * is already either underway or in the line.
   */
  const voice = useCallback(
    async (lessonId: string) => {
      const here = standing[lessonId]
      if (here && here.state !== 'none' && here.state !== 'failed') return
      if (line.current.includes(lessonId)) return

      const busy = Object.values(standing).some(
        l => l.state === 'queued' || l.state === 'voicing'
      )

      if (busy) {
        if (!line.current.includes(lessonId)) line.current = [...line.current, lessonId]
        setWaiting(rest => (rest.includes(lessonId) ? rest : [...rest, lessonId]))
        // Shown as queued straight away: the reader pressed it, and a
        // control that does nothing visible for five seconds reads as
        // a control that did not work.
        setStanding(s => ({ ...s, [lessonId]: { state: 'queued', done: 0, total: null } }))
        return
      }

      setStanding(s => ({ ...s, [lessonId]: { state: 'queued', done: 0, total: null } }))
      await api.lessons.listen(lessonId)
      await ask(key)
    },
    [standing, ask, key]
  )

  /** How many are waiting behind the one being made. */
  return { standing, voice, queued: waiting.length }
}
