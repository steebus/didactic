'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import Link from 'next/link'
import { didactic } from '@didactic/api'
import type { SpokenChunk, Voicing } from '@didactic/api/lessons'
import { useBench } from './Bench'
import styles from './Player.module.css'

const api = didactic()

/**
 * A lesson, playing, while the reader is somewhere else.
 *
 * The whole reason this sits above the router: listening is the one
 * thing in the catalogue that must survive walking off the sheet that
 * started it. A player mounted under a route would stop the moment the
 * reader opened the map, which is precisely when they want it running.
 *
 * It is one `<audio>` element for the whole app, and it is never
 * unmounted. Chunks are fed to it in turn -- the lesson is cut into
 * pieces so playback can start before the last of them exists -- and
 * the element is told to play the next one when the current ends. To
 * the reader it is one recording; to the browser it is a queue.
 *
 * Android's lockscreen controls are the Media Session API and nothing
 * more: a page playing real audio with metadata set and handlers
 * registered gets a notification with transport controls, and keeps
 * playing with the screen off. There is no native app in this and none
 * is needed.
 */

/** How often to ask what else has been made, while it is still coming. */
const POLL_MS = 4000

interface Playing {
  lessonId: string
  title: string
  /** The pieces that exist, in order. Grows as the worker makes them. */
  chunks: SpokenChunk[]
  /** How many there will be in the end. Null until the worker has said. */
  total: number | null
  state: Voicing['state']
}

interface Controls {
  /** Start listening to a lesson. Queues the reading if there is none. */
  listen: (lesson: { id: string; title: string }) => Promise<void>
  /** Which lesson is loaded, if any. */
  lessonId: string | null
  playing: boolean
}

const Channel = createContext<Controls>({
  listen: async () => {},
  lessonId: null,
  playing: false,
})

export function usePlayer(): Controls {
  return useContext(Channel)
}

export function Player({ children }: { children: React.ReactNode }) {
  const [now, setNow] = useState<Playing | null>(null)
  const [at, setAt] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const audio = useRef<HTMLAudioElement | null>(null)
  const { start } = useBench()

  /**
   * How far in we are, in seconds, across the whole lesson.
   *
   * Summed from the chunks rather than read off the element, which only
   * knows about the piece it is playing. The reader is listening to a
   * lesson, not to file seven of twelve.
   */
  const before = useMemo(
    () => (now ? now.chunks.slice(0, at).reduce((n, c) => n + c.seconds, 0) : 0),
    [now, at]
  )

  /**
   * How long the whole thing runs.
   *
   * Only honest once every piece exists. While it is still being made
   * this is the length of what has been made so far, which would make
   * the bar jump backwards as it grows -- so it is null until the
   * lesson is complete and the bar shows position without a total.
   */
  const total = useMemo(() => {
    if (!now || now.state !== 'ready') return null
    return now.chunks.reduce((n, c) => n + c.seconds, 0)
  }, [now])

  /** Ask what else has been made. */
  const refresh = useCallback(async (lessonId: string) => {
    const got = await api.lessons.voicing(lessonId)
    if (!got.ok) return null
    return got.body
  }, [])

  const listen = useCallback(
    async (lesson: { id: string; title: string }) => {
      // Already loaded: this is a press on the lesson that is playing,
      // so it means pause or resume rather than start again.
      if (now?.lessonId === lesson.id) {
        const el = audio.current
        if (!el) return
        if (el.paused) void el.play()
        else el.pause()
        return
      }

      const first = await refresh(lesson.id)

      // Nothing has been made, so ask for it. The queueing is a bench
      // job, which is what carries the wait across a navigation and
      // tells the reader it is safe to walk off -- the same mechanism
      // writing a lesson uses.
      if (!first || first.state === 'none' || first.state === 'failed') {
        void start({ kind: 'voicing', id: lesson.id, name: lesson.title }, async () => {
          const queued = await api.lessons.listen(lesson.id)
          if (!queued.ok) throw new Error(queued.error ?? 'This lesson could not be read aloud.')

          // Wait for the first piece, and only the first: the point of
          // the whole design is that the reader starts listening while
          // the rest is still being made.
          for (;;) {
            const got = await refresh(lesson.id)
            if (got?.state === 'failed') {
              throw new Error(got.reason ?? 'The reading failed.')
            }
            if (got?.chunks.length) {
              setNow({
                lessonId: lesson.id,
                title: got.title ?? lesson.title,
                chunks: got.chunks,
                total: got.total,
                state: got.state,
              })
              setAt(0)
              return { href: null }
            }
            await new Promise(r => setTimeout(r, POLL_MS))
          }
        })
        return
      }

      // Something is already made: play it now.
      setNow({
        lessonId: lesson.id,
        title: first.title ?? lesson.title,
        chunks: first.chunks,
        total: first.total,
        state: first.state,
      })
      setAt(0)
    },
    [now, refresh, start]
  )

  /**
   * Keep asking while the lesson is still being made.
   *
   * Stops as soon as it is ready, so a lesson playing from storage
   * polls nothing at all.
   */
  useEffect(() => {
    if (!now || now.state === 'ready' || now.state === 'failed') return
    const tick = setInterval(async () => {
      const got = await refresh(now.lessonId)
      if (!got) return
      setNow(current =>
        current && current.lessonId === now.lessonId
          ? { ...current, chunks: got.chunks, total: got.total, state: got.state }
          : current
      )
    }, POLL_MS)
    return () => clearInterval(tick)
  }, [now, refresh])

  /** Feed the element the piece it should be playing. */
  useEffect(() => {
    const el = audio.current
    const chunk = now?.chunks[at]
    if (!el || !chunk?.url) return
    if (el.dataset.src === chunk.url) return
    el.dataset.src = chunk.url
    el.src = chunk.url
    if (playing) void el.play().catch(() => {})
  }, [now, at, playing])

  /**
   * The lockscreen.
   *
   * This is the whole of "media controls on Android": metadata so the
   * notification says what is playing, and handlers so its buttons do
   * something. Guarded because Safari and older browsers have no
   * mediaSession at all, and a missing API must not take the player
   * down with it.
   */
  useEffect(() => {
    if (!now || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return

    navigator.mediaSession.metadata = new MediaMetadata({
      title: now.title,
      artist: 'Didactic',
      album: 'Lesson',
    })

    const el = () => audio.current

    navigator.mediaSession.setActionHandler('play', () => void el()?.play())
    navigator.mediaSession.setActionHandler('pause', () => el()?.pause())
    // Skip moves a piece at a time, which is roughly a paragraph: the
    // unit the lesson was cut on is also the unit worth skipping by.
    navigator.mediaSession.setActionHandler('previoustrack', () => setAt(n => Math.max(0, n - 1)))
    navigator.mediaSession.setActionHandler('nexttrack', () =>
      setAt(n => Math.min((now.chunks.length || 1) - 1, n + 1))
    )
    navigator.mediaSession.setActionHandler('seekbackward', () => {
      const a = el()
      if (a) a.currentTime = Math.max(0, a.currentTime - 15)
    })
    navigator.mediaSession.setActionHandler('seekforward', () => {
      const a = el()
      if (a) a.currentTime += 15
    })

    return () => {
      for (const action of [
        'play',
        'pause',
        'previoustrack',
        'nexttrack',
        'seekbackward',
        'seekforward',
      ] as const) {
        try {
          navigator.mediaSession.setActionHandler(action, null)
        } catch {
          // An action this browser does not know. Nothing to undo.
        }
      }
    }
  }, [now])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
  }, [playing])

  /**
   * How much room the player takes, so the bench's notices stand on it
   * rather than under it. The same variable anything docked at the foot
   * already reads.
   */
  useEffect(() => {
    const root = document.documentElement
    if (now) root.style.setProperty('--foot-bar', '4.5rem')
    else root.style.removeProperty('--foot-bar')
    return () => {
      root.style.removeProperty('--foot-bar')
    }
  }, [now])

  const onEnded = useCallback(() => {
    if (!now) return
    const next = at + 1
    // The end of what exists, but not the end of the lesson: the worker
    // has not caught up. Hold here -- the poll will bring the next piece
    // and the effect above will start it.
    if (next >= now.chunks.length) {
      if (now.state === 'ready') setPlaying(false)
      return
    }
    setAt(next)
  }, [now, at])

  const close = useCallback(() => {
    audio.current?.pause()
    setNow(null)
    setPlaying(false)
    setAt(0)
  }, [])

  const controls = useMemo(
    () => ({ listen, lessonId: now?.lessonId ?? null, playing }),
    [listen, now, playing]
  )

  // Waiting for the piece after the one that just finished.
  const starved = Boolean(
    now && !playing && now.state !== 'ready' && at >= now.chunks.length - 1
  )

  return (
    <Channel.Provider value={controls}>
      {children}

      {/* Never unmounted while a lesson is loaded, and never moved:
          re-parenting an <audio> element stops it, which on a phone
          reads as the app cutting out when you navigate. */}
      <audio
        ref={audio}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={onEnded}
        onTimeUpdate={e => setElapsed(e.currentTarget.currentTime)}
        preload="auto"
      />

      {now && (
        <div className={styles.bar} role="region" aria-label="Lesson audio">
          <div className={styles.what}>
            <Link href={`/lesson/${now.lessonId}`} className={styles.title}>
              {now.title}
            </Link>
            <p className={styles.where}>
              {starved
                ? 'Making the next piece…'
                : total
                  ? `${clock(before + elapsed)} of ${clock(total)}`
                  : `${clock(before + elapsed)} · still being read`}
            </p>
          </div>

          <div className={styles.buttons}>
            <button
              type="button"
              className={styles.button}
              onClick={() => setAt(n => Math.max(0, n - 1))}
              disabled={at === 0}
              aria-label="Back a piece"
            >
              ⏮
            </button>
            <button
              type="button"
              className={styles.play}
              onClick={() => {
                const el = audio.current
                if (!el) return
                if (el.paused) void el.play()
                else el.pause()
              }}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? '⏸' : '▶'}
            </button>
            <button
              type="button"
              className={styles.button}
              onClick={() => setAt(n => Math.min(now.chunks.length - 1, n + 1))}
              disabled={at >= now.chunks.length - 1}
              aria-label="On a piece"
            >
              ⏭
            </button>
            <button
              type="button"
              className={styles.button}
              onClick={close}
              aria-label="Stop listening"
            >
              ✕
            </button>
          </div>

          {/* Position without a total while the lesson is still being
              made: a bar that fills as the recording grows would run
              backwards, which is worse than no bar. */}
          {total !== null && (
            <div
              className={styles.track}
              style={{ ['--played' as string]: `${((before + elapsed) / total) * 100}%` }}
            />
          )}
        </div>
      )}
    </Channel.Provider>
  )
}

/** Seconds as a clock, the way any player prints them. */
function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const mins = Math.floor(whole / 60)
  const secs = whole % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
