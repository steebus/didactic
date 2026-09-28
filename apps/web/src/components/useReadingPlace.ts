'use client'

import { useCallback, useEffect, useState } from 'react'
import { didactic, type BookmarkIn } from '@didactic/api'
import type { Place } from '@didactic/core/bookmarks'
import { hasText, offsetOf, placeFromPoint } from '@/lib/place'

const api = didactic()

/** How far down the window the reader's line is: where a dropped
 *  bookmark lands, and where a kept scroll position is read and put
 *  back. A third of the way, not the middle, for the scroll -- it is
 *  about where the eye is, and the eye reads the top half. */
const READING_LINE = 1 / 3

/** Where a pressed bookmark lands: the middle of what is on screen. */
const MIDDLE = 1 / 2

/** A little way in from the edge of the prose, clear of a list's bullets. */
const INSET = 24

/** The key a reading's scroll position is kept under, on this device. */
const scrollKey = (of: BookmarkIn) =>
  `didactic:place:${of.lessonId ? `lesson:${of.lessonId}` : `resource:${of.resourceId}`}`

/**
 * Where the reader stopped: the bookmark they dropped, kept on the
 * server so it follows them to another device, and where it now stands
 * on the page.
 *
 * `top` is measured from the top of `root` and re-measured whenever the
 * prose moves under it -- a picture arriving, the window changing width.
 */
export function useBookmark(root: HTMLElement | null, of: BookmarkIn | null) {
  const [bookmark, setBookmark] = useState<Place | null>(null)
  const [top, setTop] = useState<number | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  // `of` is held steady by the caller (a memo on the ids), so this asks
  // once per reading rather than once per render.
  useEffect(() => {
    if (!of) return
    let live = true
    void api.bookmarks.get(of).then(({ ok, body }) => {
      if (live && ok) setBookmark(body.bookmark)
    })
    return () => {
      live = false
    }
  }, [of])

  const locate = useCallback(() => {
    if (!root || !bookmark || !hasText(root)) return setTop(null)
    setTop(Math.round(offsetOf(root, bookmark)))
  }, [root, bookmark])

  useEffect(() => {
    let frame = 0
    const soon = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(locate)
    }
    soon()
    if (!root) return () => cancelAnimationFrame(frame)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(soon)
    observer?.observe(root)
    window.addEventListener('resize', soon)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', soon)
    }
  }, [root, locate])

  /** Keep a place, and put the last one back if the server refuses it. */
  const keep = useCallback(
    (next: Place | null) => {
      const where = of
      if (!where) return
      const before = bookmark
      setBookmark(next)
      setProblem(null)
      void (next ? api.bookmarks.place(where, next) : api.bookmarks.remove(where)).then(
        ({ ok, error }) => {
          if (ok) return
          setBookmark(before)
          setProblem(
            `The bookmark was not ${next ? 'kept' : 'taken out'}: ${error ?? 'something went wrong'}.`
          )
        }
      )
    },
    [of, bookmark]
  )

  /** Drop it at a point in the window. False where there is no reading
   *  under the point, which leaves any bookmark already there alone. */
  const dropAt = useCallback(
    (y: number) => {
      if (!root) return false
      const x = root.getBoundingClientRect().left + INSET
      const place = placeFromPoint(root, x, y)
      if (place) keep(place)
      return Boolean(place)
    },
    [root, keep]
  )

  /** Drop it at the middle of what is on screen. */
  const dropHere = useCallback(() => dropAt(window.innerHeight * MIDDLE), [dropAt])

  /** Take it out. */
  const remove = useCallback(() => keep(null), [keep])

  /** Bring it into view. */
  const goTo = useCallback(() => {
    if (!root || top === null) return
    const y = root.getBoundingClientRect().top + window.scrollY + top
    window.scrollTo({ top: y - window.innerHeight * READING_LINE, behavior: 'smooth' })
  }, [root, top])

  return { bookmark, top, problem, dropAt, dropHere, remove, goTo }
}

/**
 * Where the reader was, on this device, put back when they come back.
 *
 * Kept as words, like the bookmark, and in the browser rather than on
 * the server: it is a convenience of the screen being read on, not a
 * decision the reader made. Not put back when the address names a
 * section -- a link to a heading means that heading -- or when there is
 * nothing kept. Answers whether it put the reader somewhere.
 */
export function useKeptScroll(root: HTMLElement | null, of: BookmarkIn | null) {
  const key = of ? scrollKey(of) : null
  const [restored, setRestored] = useState<boolean | null>(null)

  // Put back once, as soon as there is prose to put back into. A lesson
  // arrives after the page does, so it waits for the text.
  useEffect(() => {
    if (!root || !key) return
    let done = false

    const tryRestore = () => {
      if (done || !hasText(root)) return
      done = true
      watcher.disconnect()

      let kept: Place | null = null
      try {
        const raw = localStorage.getItem(key)
        kept = raw ? (JSON.parse(raw) as Place) : null
      } catch {
        kept = null
      }
      if (!kept?.words || window.location.hash) return setRestored(false)

      const y = root.getBoundingClientRect().top + window.scrollY + offsetOf(root, kept)
      window.scrollTo({ top: Math.max(0, y - window.innerHeight * READING_LINE) })
      setRestored(true)
    }

    const watcher = new MutationObserver(tryRestore)
    watcher.observe(root, { childList: true, subtree: true, characterData: true })
    tryRestore()
    return () => watcher.disconnect()
  }, [root, key])

  // Written down whenever the reader stops scrolling. Above the reading
  // -- back at the head of the sheet -- there is nothing to keep, and
  // what was kept goes, so the next visit starts at the top too. Below
  // it -- the foot, *How did you go?* -- the last place in the prose
  // stands.
  useEffect(() => {
    if (!root || !key || restored === null) return
    let timer = 0
    const note = () => {
      clearTimeout(timer)
      timer = window.setTimeout(() => {
        const line = window.innerHeight * READING_LINE
        const box = root.getBoundingClientRect()
        if (box.bottom < line) return
        const place = box.top > line ? null : placeFromPoint(root, box.left + INSET, line)
        try {
          if (place) localStorage.setItem(key, JSON.stringify(place))
          else localStorage.removeItem(key)
        } catch {
          // Site data blocked: the next visit starts at the top.
        }
      }, 400)
    }
    window.addEventListener('scroll', note, { passive: true })
    return () => {
      clearTimeout(timer)
      window.removeEventListener('scroll', note)
    }
  }, [root, key, restored])

  return restored
}
