'use client'

import { useLayoutEffect, useRef } from 'react'

/**
 * Slide rows into their new places when a list is reordered.
 *
 * A nudge that waits on the server before anything moves does not read
 * as a nudge -- the row stays put for a round trip and then the whole
 * list jumps. What makes the control feel like it moved the thing is
 * that the movement is the response, and the write is a consequence
 * nobody watches.
 *
 * This measures every row before the re-render, compares it with where
 * the row ended up, and plays the difference backwards: each row is
 * offset to its old position and released. The browser is laying the
 * list out in its final state the whole time, so nothing here can leave
 * a row somewhere it does not belong -- a transform that fails to run is
 * a list that simply did not animate.
 *
 * Read the keys from the same order the rows are drawn from, so the hook
 * sees a reorder as a reorder rather than as a set of unrelated moves.
 */
export function useSlide(keys: string[]) {
  const nodes = useRef(new Map<string, HTMLElement>())
  const boxes = useRef(new Map<string, DOMRect>())
  const order = useRef<string>(keys.join())

  useLayoutEffect(() => {
    const next = keys.join()
    const moved = order.current !== next
    order.current = next

    if (moved) {
      for (const [key, node] of nodes.current) {
        const was = boxes.current.get(key)
        if (!was) continue
        const now = node.getBoundingClientRect()
        const dy = was.top - now.top
        // A row that did not move needs no animation, and animating it
        // anyway is a frame of work per row on every reorder.
        if (Math.abs(dy) < 1) continue

        node.animate(
          [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
          {
            duration: 300,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            // The OS setting is honoured here rather than in CSS,
            // because the movement is script-driven: a reader who has
            // asked for less motion gets the new order without the
            // travel.
            ...(window.matchMedia('(prefers-reduced-motion: reduce)').matches
              ? { duration: 0 }
              : {}),
          }
        )
      }
    }

    // Measure for next time, after any animation has been scheduled.
    boxes.current = new Map(
      [...nodes.current].map(([key, node]) => [key, node.getBoundingClientRect()])
    )
  })

  /** Give each row this as its `ref`, keyed the way the list is keyed. */
  return (key: string) => (node: HTMLElement | null) => {
    if (node) nodes.current.set(key, node)
    else nodes.current.delete(key)
  }
}
