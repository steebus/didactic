'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  READING_SIZE_KEY,
  readingSize,
  stepReadingSize,
} from '@didactic/core/readingSize'

/** The property the reading is drawn at, on the root, which the
 *  layout's head script stamps before the first paint. */
const PROPERTY = '--reading-size'

function stamp(size: number) {
  if (size === 1) document.documentElement.style.removeProperty(PROPERTY)
  else document.documentElement.style.setProperty(PROPERTY, String(size))
}

/**
 * The size the reading is set at on this device, and the way to step it.
 *
 * The figure lives on the root as a custom property rather than in React,
 * so every lesson and resource opened afterwards is drawn at it from its
 * first frame -- the head script puts it there before anything renders.
 * This only reads it back to know which way there is left to go, and
 * writes both the property and the device's copy when it moves.
 *
 * A step keeps the reader's place: whatever block stood at the middle of
 * the screen stands there again once the reading has grown or shrunk
 * round it, instead of the page sliding away above the reader's eye.
 */
export function useReadingSize(page: HTMLElement | null) {
  const [size, setSize] = useState(1)

  useEffect(() => {
    const read = () => {
      try {
        setSize(readingSize(localStorage.getItem(READING_SIZE_KEY)))
      } catch {
        setSize(1)
      }
    }
    read()
    // Another tab stepped it: this one follows, so the device has one size.
    const other = (e: StorageEvent) => {
      if (e.key !== READING_SIZE_KEY) return
      const next = readingSize(e.newValue)
      stamp(next)
      setSize(next)
    }
    window.addEventListener('storage', other)
    return () => window.removeEventListener('storage', other)
  }, [])

  const step = useCallback(
    (way: 1 | -1) => {
      const next = stepReadingSize(size, way)
      if (next === size) return

      const held = page ? blockAtMiddle(page) : null
      const before = held?.getBoundingClientRect().top

      stamp(next)
      setSize(next)
      try {
        if (next === 1) localStorage.removeItem(READING_SIZE_KEY)
        else localStorage.setItem(READING_SIZE_KEY, String(next))
      } catch {
        // Site data blocked: the size holds for this visit and no longer.
      }

      if (held && before !== undefined) {
        window.scrollBy({ top: held.getBoundingClientRect().top - before, behavior: 'instant' })
      }
    },
    [size, page]
  )

  return { size, step }
}

/** The block of the reading standing at the middle of the screen. */
function blockAtMiddle(page: HTMLElement): HTMLElement | null {
  const blocks = page.querySelectorAll<HTMLElement>('[data-prose] > *')
  const middle = window.innerHeight / 2
  let best: HTMLElement | null = null
  for (const block of blocks) {
    const r = block.getBoundingClientRect()
    if (r.bottom < 0) continue
    if (r.top > middle) break
    best = block
  }
  return best
}
