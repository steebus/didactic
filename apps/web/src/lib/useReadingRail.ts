'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Whether the reader has scrolled past the head of the sheet.
 *
 * Watches a sentinel left where the head ends rather than reading
 * `scrollY` on every frame: the browser tells us once when the line is
 * crossed, and a scroll handler on a long reading page is the one place
 * a few wasted milliseconds are actually felt.
 *
 * The sentinel is in normal flow, so where the head ends is wherever it
 * ends -- a two-line title on a phone and a one-line title on a desk
 * cross at different places and neither needs a number written down
 * here.
 *
 * Answers `false` until it has looked, so a page that arrives already
 * scrolled -- a reader coming back to where they left off, which this
 * app restores -- corrects itself on the observer's first callback
 * rather than flashing the rail on at the top of every load.
 */
export function useReadingRail<T extends HTMLElement>() {
  const sentinel = useRef<T>(null)
  const [past, setPast] = useState(false)

  useEffect(() => {
    const node = sentinel.current
    if (!node) return

    // A browser without it keeps the plain head, which is the whole of
    // what is lost: the rail is a convenience, not the navigation.
    if (typeof IntersectionObserver === 'undefined') return

    const watch = new IntersectionObserver(
      ([entry]) => {
        // Not `!isIntersecting`: the sentinel is also out of view when
        // it is *below* the fold, which is where it sits before the
        // page is scrolled at all on a short screen.
        setPast(entry.boundingClientRect.top < 0 && !entry.isIntersecting)
      },
      { threshold: 0 }
    )
    watch.observe(node)
    return () => watch.disconnect()
  }, [])

  return { sentinel, past }
}
