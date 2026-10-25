'use client'

import { useEffect, useRef } from 'react'

/**
 * A page never opened here starts at its head. The window keeps the
 * offset it had on the page before, so a lesson reached from the foot
 * of another opened at its own foot. Left alone when something else has
 * already placed the reader -- a link to a heading, or the reading
 * place kept in the prose -- which shows as the offset having moved.
 */
function startAtTop() {
  const inherited = window.scrollY
  if (inherited <= 0 || window.location.hash) return
  requestAnimationFrame(() => {
    if (window.scrollY === inherited) window.scrollTo({ top: 0, behavior: 'auto' })
  })
}

/**
 * Remember where a long page was left and return there on the next open.
 *
 * Per-device by design: this is "where I was reading", not product truth,
 * so it lives in sessionStorage rather than the exposure log.
 *
 * `ready` gates restoration until the content exists — restoring before
 * the body renders would scroll a short page and be overwritten.
 */
export function useScrollMemory(key: string, ready: boolean) {
  const restored = useRef(false)

  useEffect(() => {
    if (!ready || restored.current) return
    restored.current = true

    try {
      const saved = sessionStorage.getItem(`scroll:${key}`)
      if (!saved) return startAtTop()
      const y = Number(saved)
      if (!Number.isFinite(y) || y <= 0) return startAtTop()
      // After paint, or the document is not yet tall enough to scroll.
      requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'auto' }))
    } catch {
      // Private mode, or storage disabled. Reading still works.
    }
  }, [key, ready])

  useEffect(() => {
    if (!ready) return

    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        try {
          sessionStorage.setItem(`scroll:${key}`, String(window.scrollY))
        } catch {
          // Nothing to do: losing the position is not worth an error.
        }
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [key, ready])
}
