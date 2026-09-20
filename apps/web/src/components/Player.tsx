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
import { placeAt, secondsBefore, spokenClock, spokenLength } from '@didactic/core/voicing'
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
  /**
   * What is being said right now, for a sheet that wants to follow
   * along. Null when nothing is playing.
   *
   * The text rather than an index, because the sheet showing the lesson
   * and the recording of it agree on words and on nothing else: the
   * audio is cut into pieces by `core/speech` and the page is laid out
   * in paragraphs and blocks, and the two need not line up one to one.
   * Words are the only thing both have.
   */
  saying: string | null
  /** Jump the recording to the piece that says this, if there is one. */
  sayThis: (text: string) => void
  /**
   * Ask the bar to stand aside while something else needs the foot of
   * the sheet -- the mark composer, which docks across it.
   *
   * The player gives way rather than the composer, and it gives way by
   * folding rather than by moving: it is the background thing, and a
   * reader writing a note about a passage is doing the foreground one.
   * What it leaves behind is the same disc a reader gets by folding it
   * themselves, standing on the panel.
   *
   * Says nothing about the reader's own fold, which survives it: a
   * composer that opened and closed must not hand back a bar they had
   * already put away.
   */
  standAside: (yes: boolean) => void
}

const Channel = createContext<Controls>({
  listen: async () => {},
  lessonId: null,
  playing: false,
  saying: null,
  sayThis: () => {},
  standAside: () => {},
})

export function usePlayer(): Controls {
  return useContext(Channel)
}

export function Player({ children }: { children: React.ReactNode }) {
  const [now, setNow] = useState<Playing | null>(null)
  const [at, setAt] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  /**
   * Where the thumb is while the reader is dragging it. Null the rest
   * of the time, when the bar simply reports where the audio is.
   *
   * Held apart from the seek itself so the drag is not the seek. A bar
   * that sought on every pixel would load a new file each time the
   * thumb crossed a piece -- a dozen of them across one drag -- and the
   * reader would hear the lesson hopping about while they were still
   * deciding where to put it. The thumb moves freely; letting go is
   * what asks for anything.
   */
  const [scrub, setScrub] = useState<number | null>(null)
  /**
   * Folded away: the bar is down to a disc in the corner and the lesson
   * is still playing.
   *
   * Not the same as stopping, which is what the ✕ does. A reader who
   * wants to write a note under a passage they are listening to wants
   * the foot of the screen back, not the recording ended -- and every
   * way of giving it back by moving other things is the reflow this
   * player exists not to cause.
   */
  const [folded, setFolded] = useState(false)
  /**
   * Something else has the foot of the sheet, so the bar is down to its
   * disc until that thing is done.
   *
   * Apart from `folded` because the two are different facts: one is the
   * reader putting the player away, the other is the player giving way.
   * Collapsed into one they would be indistinguishable on the way back
   * up -- a composer closing would hand back a bar the reader had
   * already folded, every time.
   */
  const [aside, setAside] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)
  const bar = useRef<HTMLDivElement | null>(null)
  /**
   * Whether the reader means to be listening.
   *
   * Not the same as `playing`, which is whether a file is running right
   * now. Between two chunks the element pauses, ends, loads the next
   * and starts again -- for a moment `playing` is false while the
   * reader has done nothing and is still listening. Reading that state
   * to decide whether to start the next piece is what made the player
   * stop at the end of every paragraph and wait to be pressed.
   *
   * A ref rather than state because it is read from `onEnded` and from
   * an effect that must not re-run when it changes: what matters is its
   * value at the moment it is read, not a render in response to it.
   */
  const wants = useRef(false)
  /**
   * Where in the *next* piece to start, when the reader has arrived at
   * it by dragging rather than by playing into it.
   *
   * A ref and not state because it is written by the seek and read by
   * the effect that loads the file, and nothing renders from it. It
   * cannot be applied at the moment of the seek either: the element has
   * no duration until the new file's metadata has landed, and a
   * `currentTime` written before then is discarded.
   */
  const landing = useRef<number | null>(null)
  /**
   * The same drag, for the handlers that end it to read.
   *
   * The state above is what the bar renders from; this is what letting
   * go reads, because deciding what to seek to inside a state updater
   * would be a side effect in a setter, which React is free to run
   * twice -- and twice here is two seeks, the second from a value the
   * first has already thrown away.
   */
  const dragging = useRef<number | null>(null)
  const { start } = useBench()

  /**
   * How far in we are, in seconds, across the whole lesson.
   *
   * Summed from the chunks rather than read off the element, which only
   * knows about the piece it is playing. The reader is listening to a
   * lesson, not to file seven of twelve.
   */
  const before = useMemo(() => (now ? secondsBefore(now.chunks, at) : 0), [now, at])

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
    return spokenLength(now.chunks)
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
        // Folded away, the press is about the lesson rather than about
        // the transport: show the bar again and leave it playing, since
        // a pause the reader cannot see is a player that has broken.
        if (folded || aside) {
          setFolded(false)
          setAside(false)
          return
        }
        if (el.paused) {
          wants.current = true
          void el.play()
        } else {
          wants.current = false
          el.pause()
        }
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
              // They pressed Listen and walked off; the first piece
              // arriving is what they were waiting for.
              wants.current = true
              // A lesson starting is worth seeing: whatever the reader
              // folded away, it was not this one.
              setFolded(false)
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
      wants.current = true
      setFolded(false)
      setNow({
        lessonId: lesson.id,
        title: first.title ?? lesson.title,
        chunks: first.chunks,
        total: first.total,
        state: first.state,
      })
      setAt(0)
    },
    [now, folded, aside, refresh, start]
  )

  /**
   * Keep asking while the lesson is still being made.
   *
   * Stops as soon as it is ready, so a lesson playing from storage
   * polls nothing at all.
   */
  // Depends on the lesson and its state, never on `now` itself: the
  // interval's own `setNow` makes a new object every poll, and an
  // effect that watched `now` would tear its own interval down and
  // build another one four times a minute -- and again on every tick of
  // `elapsed`, which is four times a second while the audio runs.
  const lessonId = now?.lessonId ?? null
  const settled = now ? now.state === 'ready' || now.state === 'failed' : true

  useEffect(() => {
    if (!lessonId || settled) return
    const tick = setInterval(async () => {
      const got = await refresh(lessonId)
      if (!got) return
      setNow(current =>
        current && current.lessonId === lessonId
          ? { ...current, chunks: got.chunks, total: got.total, state: got.state }
          : current
      )
    }, POLL_MS)
    return () => clearInterval(tick)
  }, [lessonId, settled, refresh])

  /**
   * Feed the element the piece it should be playing.
   *
   * Keyed on the chunk's path rather than its URL. A signed URL carries
   * the moment it was signed, so the poll that fetches the pieces still
   * to come hands back a different string for the piece already
   * playing -- and reloading the source on that restarts it. That was
   * three seconds of audio on a loop for as long as the lesson was
   * still being made, and playing correctly the moment it finished,
   * which is exactly the shape of a bug that only exists while polling.
   */
  useEffect(() => {
    const el = audio.current
    const chunk = now?.chunks[at]
    if (!el || !chunk?.url) return
    if (el.dataset.path === chunk.path) return
    el.dataset.path = chunk.path
    el.src = chunk.url

    // Where in this piece to start. Set by a seek that crossed into it;
    // null when the reader simply played their way here, which starts
    // at the beginning as it always did.
    const offset = landing.current
    landing.current = null

    // Only once the file has a duration. `currentTime` written against
    // an element that has not loaded its metadata is thrown away, which
    // is a seek that silently starts the piece from the top.
    let land: (() => void) | null = null
    if (offset) {
      land = () => {
        el.currentTime = offset
      }
      el.addEventListener('loadedmetadata', land, { once: true })
    }

    // `wants` rather than `playing`: at the moment a chunk ends the
    // element is paused, so the state says false while the reader is
    // very much still listening.
    if (wants.current) void el.play().catch(() => {})

    // A source replaced before its metadata arrived would otherwise
    // leave a listener that seeks the *next* piece to the offset meant
    // for this one.
    return () => {
      if (land) el.removeEventListener('loadedmetadata', land)
    }
  }, [now, at])

  /**
   * Put the recording at a given second of the lesson.
   *
   * The reader is dragging one bar across one lesson; the lesson is a
   * dozen files. `placeAt` is the whole of the translation between the
   * two, and it lives in core because the phone's player is a different
   * player over the same pieces.
   *
   * Two cases, and they are not the same cost. Inside the piece already
   * loaded, this is one write to `currentTime` and the audio moves
   * immediately. Into another piece, the file has to be fetched, so the
   * offset is left for the loader to apply once the metadata lands.
   *
   * `elapsed` is set here rather than waited for. The bar reads
   * `before + elapsed`, and `before` moves the instant `at` does -- so
   * leaving `elapsed` to the next `timeupdate` shows the new piece's
   * position added to the old piece's offset for a frame, which is a
   * thumb that jumps somewhere wrong before it settles somewhere right.
   */
  const seekTo = useCallback(
    (seconds: number) => {
      if (!now) return
      const place = placeAt(now.chunks, seconds)
      setElapsed(place.offset)

      if (place.index === at) {
        const el = audio.current
        if (el) el.currentTime = place.offset
        return
      }

      landing.current = place.offset
      setAt(place.index)
    },
    [now, at]
  )

  /** Let go of the bar: the drag becomes a seek, or nothing if there
   *  was no drag. */
  const release = useCallback(() => {
    const to = dragging.current
    dragging.current = null
    if (to !== null) seekTo(to)
    setScrub(null)
  }, [seekTo])

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

    navigator.mediaSession.setActionHandler('play', () => {
      wants.current = true
      void el()?.play()
    })
    navigator.mediaSession.setActionHandler('pause', () => {
      wants.current = false
      el()?.pause()
    })
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
    // The notification's own scrubber. It reports a second of the whole
    // lesson, which is exactly what `seekTo` takes -- the lockscreen and
    // the bar at the foot of the sheet are the same control in two
    // places, and they had better agree about what a position is.
    navigator.mediaSession.setActionHandler('seekto', details => {
      if (typeof details.seekTime !== 'number') return
      seekTo(details.seekTime)
    })

    return () => {
      for (const action of [
        'play',
        'pause',
        'previoustrack',
        'nexttrack',
        'seekbackward',
        'seekforward',
        'seekto',
      ] as const) {
        try {
          navigator.mediaSession.setActionHandler(action, null)
        } catch {
          // An action this browser does not know. Nothing to undo.
        }
      }
    }
  }, [now, seekTo])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
  }, [playing])

  /**
   * Where the lockscreen's own bar sits.
   *
   * Without this the notification reads the element, which knows only
   * about the piece it is playing -- so a twelve-minute lesson showed as
   * forty seconds, twelve times over. The whole lesson is the honest
   * duration, and only once every piece of it exists.
   *
   * Clamped, and not for tidiness: `setPositionState` throws when the
   * position is past the duration, and chunk lengths are stored rounded,
   * so the sum of them is a little under what actually plays.
   */
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    if (!navigator.mediaSession.setPositionState) return
    if (total === null || total <= 0) {
      navigator.mediaSession.setPositionState()
      return
    }
    try {
      navigator.mediaSession.setPositionState({
        duration: total,
        position: Math.min(Math.max(0, before + elapsed), total),
        playbackRate: audio.current?.playbackRate || 1,
      })
    } catch {
      // A browser that has the method and refuses the figures. The bar
      // in the sheet is the one that matters; this is the courtesy copy.
    }
  }, [total, before, elapsed])

  /*
   * The player deliberately sets no `--foot-bar`.
   *
   * It used to, and everything docked at the foot stood on it: the
   * bench climbed, and the marking desk climbed on top of the bench.
   * So pressing Listen re-laid the foot of every sheet in the
   * catalogue, and pressing stop re-laid it back -- buttons moving out
   * from under a thumb that was already reaching for them, in the
   * middle of reading, because a recording started somewhere else.
   *
   * It is the one piece of furniture here that the reader turns on and
   * off at will, and furniture that comes and goes must not be
   * something the rest of the page is arranged around. So it lies over
   * the foot instead, and when it is in the way it folds (below) --
   * which is a press the reader chose, not a reflow they did not.
   *
   * `--foot-bar` is left alone rather than deleted: it is still the
   * right contract for anything genuinely docked, which this is not.
   */

  const onEnded = useCallback(() => {
    if (!now) return
    const next = at + 1
    // The end of what exists, but not the end of the lesson: the worker
    // has not caught up. Hold here -- the poll will bring the next piece
    // and the effect above will start it, because `wants` is still set.
    if (next >= now.chunks.length) {
      // Only the true end of the lesson stops the listening.
      if (now.state === 'ready') wants.current = false
      return
    }
    setAt(next)
  }, [now, at])

  const close = useCallback(() => {
    wants.current = false
    audio.current?.pause()
    setNow(null)
    setPlaying(false)
    setAt(0)
    // The next lesson opens as a bar, not as whatever this one was left
    // as: a fold is about the recording in hand, not a setting.
    setFolded(false)
  }, [])

  /**
   * Jump to the piece that says a given passage.
   *
   * Matched on the opening words rather than the whole text: the sheet
   * asks with a paragraph and the recording holds a chunk, and a chunk
   * is sometimes a heading and the paragraph under it, or half of a
   * paragraph too long to say in one go. The opening is the part the
   * two always share.
   */
  const sayThis = useCallback(
    (text: string) => {
      if (!now) return
      const opening = norm(text).slice(0, 40)
      if (!opening) return
      const found = now.chunks.findIndex(c => norm(c.text).includes(opening))
      if (found < 0) return
      wants.current = true
      setAt(found)
      // The same piece, so nothing reloads: seek back to its start.
      if (found === at && audio.current) {
        audio.current.currentTime = 0
        void audio.current.play().catch(() => {})
      }
    },
    [now, at]
  )

  const standAside = useCallback((yes: boolean) => setAside(yes), [])

  /** Whether the bar itself is showing, as against the disc or nothing. */
  const barUp = Boolean(now) && !folded && !aside

  /**
   * How tall the bar is, for the marking desk to clear.
   *
   * Measured rather than written down: it is a row of 44px controls in
   * padding plus the phone's own chin, and a number copied into a
   * stylesheet is a number that goes wrong the first time any of those
   * changes. The bench measures itself the same way.
   *
   * This is *not* `--foot-bar`, and deliberately so. That is the
   * contract for standing on something docked, and everything reading
   * it moved when a recording started. Only the desk reads this one,
   * through a `max()` that leaves it exactly where it was whenever
   * there is no bar -- two buttons lifting clear, rather than the foot
   * of every sheet in the catalogue re-laying itself.
   */
  useEffect(() => {
    const node = bar.current
    const root = document.documentElement
    if (!node || !barUp) {
      root.style.removeProperty('--player-bar')
      return
    }

    const measure = () => {
      root.style.setProperty('--player-bar', `${node.getBoundingClientRect().height}px`)
    }
    measure()

    if (typeof ResizeObserver === 'undefined') {
      // The one measurement stands. A bar whose height changes is a bar
      // whose title wrapped, and it is built not to.
      return () => {
        root.style.removeProperty('--player-bar')
      }
    }

    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--player-bar')
    }
  }, [barUp])

  const controls = useMemo(
    () => ({
      listen,
      lessonId: now?.lessonId ?? null,
      playing,
      saying: playing ? (now?.chunks[at]?.text ?? null) : null,
      sayThis,
      standAside,
    }),
    [listen, now, playing, at, sayThis, standAside]
  )

  /**
   * The position the bar is printing: the drag while there is one, and
   * where the audio actually is the rest of the time.
   *
   * The clock beside the title reads from this too, so the figure and
   * the thumb can never disagree about where the reader is putting it.
   */
  const shown = scrub ?? before + elapsed

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

      {now && (folded || aside) && (
        /* Folded: a disc in the corner, still reporting.

           It stands on the bench rather than over it -- the bench
           publishes its own height and the marking desk already reads
           it, so this is the same arrangement rather than a second one.
           That is the player moving for something else, which is the
           direction that does not surprise anybody. */
        <button
          type="button"
          className={styles.folded}
          // Clears both reasons the bar is down. Pressed while a
          // composer has the foot, the reader is asking for the player
          // over it, which is their call to make.
          onClick={() => {
            setFolded(false)
            setAside(false)
          }}
          aria-label={`Show the player — ${now.title}`}
          title={`${now.title} — ${playing ? 'playing' : 'paused'}`}
          style={{
            ['--played' as string]: (total && total > 0
              ? Math.min(1, Math.max(0, (before + elapsed) / total))
              : 0
            ).toFixed(4),
          }}
        >
          {/* How far in, around the edge of the disc: the same fact the
              bar's own line carries, in the one place left to put it. */}
          <svg
            className={styles.foldedRing}
            width="44"
            height="44"
            viewBox="0 0 44 44"
            aria-hidden="true"
          >
            <circle className={styles.foldedRim} cx="22" cy="22" r="20" fill="none" strokeWidth="2" />
            <circle
              className={styles.foldedPlayed}
              cx="22"
              cy="22"
              r="20"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span className={styles.foldedMark} aria-hidden="true">
            <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
              <path
                d="M1 6.5 L6 1.5 L11 6.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>
      )}

      {barUp && now && (
        <div className={styles.bar} ref={bar} role="region" aria-label="Lesson audio">
          {/* First on the bar, before the lesson's name.

              It is the one control here that is about the bar rather
              than about the recording, so it stands apart from the
              transport rather than at the end of it -- where it sat
              next to ✕, which is the press that cannot be taken back,
              at the corner a thumb reaches for without looking. */}
          <button
            type="button"
            className={styles.fold}
            onClick={() => setFolded(true)}
            aria-label="Fold the player away"
            title="Fold the player away — it keeps playing"
          >
            <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden="true" fill="none">
              <path
                d="M1 1.5 L6 6.5 L11 1.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <div className={styles.what}>
            <Link href={`/lesson/${now.lessonId}`} className={styles.title}>
              {now.title}
            </Link>
            <p className={styles.where}>
              {starved
                ? 'Making the next piece…'
                : total
                  ? `${spokenClock(shown)} of ${spokenClock(total)}`
                  : `${spokenClock(shown)} · still being read`}
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
                if (el.paused) {
                  wants.current = true
                  void el.play()
                } else {
                  wants.current = false
                  el.pause()
                }
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

          {/* Position, and the way to change it.

              Nothing at all while the lesson is still being made: a bar
              that fills as the recording grows would run backwards, and
              one you could drag would be offering to seek into minutes
              that do not exist yet. The reader gets the clock and the
              skip buttons until it is whole, which is what they had.

              The line and the bead are drawn from `--played` and the
              input paints nothing: it is there for the press, the drag,
              the arrow keys and the label a screen reader reads. Native
              rather than a div with handlers for the same reason the
              topic sheet's fold is a `details` -- the element already
              carries all of that, and a hand-rolled one has to be given
              it a piece at a time. */}
          {total !== null && (
            <div
              className={styles.track}
              data-scrubbing={scrub !== null || undefined}
              // A factor rather than a percentage: the line is scaled
              // and the bead translated, so neither puts the page
              // through layout on every tick of a twelve-minute lesson.
              style={{
                ['--played' as string]: (total > 0
                  ? Math.min(1, Math.max(0, shown / total))
                  : 0
                ).toFixed(4),
              }}
            >
              <input
                type="range"
                className={styles.seek}
                min={0}
                max={Math.max(1, Math.round(total))}
                step={1}
                value={Math.min(Math.round(shown), Math.max(1, Math.round(total)))}
                onChange={e => {
                  const to = Number(e.target.value)
                  dragging.current = to
                  setScrub(to)
                }}
                // Every way a drag ends. The pointer ones cover mouse
                // and touch, `keyup` covers the arrows -- held down they
                // repeat, and one seek at the end of the run beats forty
                // on the way through it -- and `blur` covers being
                // tabbed away from mid-drag.
                onPointerUp={release}
                onPointerCancel={release}
                onKeyUp={release}
                onBlur={release}
                aria-label="Position in this lesson"
                // Otherwise this is announced as its number: a reader
                // hearing "four hundred and twelve" has been told the
                // truth and nothing useful.
                aria-valuetext={`${spokenClock(shown)} of ${spokenClock(total)}`}
              />
              <span className={styles.bead} aria-hidden="true" />
            </div>
          )}
        </div>
      )}
    </Channel.Provider>
  )
}

/**
 * A passage reduced to the words in it.
 *
 * The sheet's text and the recording's come from the same body but not
 * by the same route: one is rendered markdown read back off the page,
 * the other is `core/speech` output with the markup taken out. They
 * agree on words and disagree on spacing, case and punctuation, so this
 * is what they are compared through.
 */
function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

