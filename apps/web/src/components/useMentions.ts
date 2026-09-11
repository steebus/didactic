'use client'

import { useCallback, useEffect, useState, type RefObject } from 'react'
import { mentionAt, tagHref, type Mention } from '@/lib/mentions'
import type { Suggestion } from '@/lib/mentionSearch'

/**
 * The `@` menu inside a note box.
 *
 * A mark belongs to the lesson it came from; what it is *about* is
 * often a topic away, and saying so should not mean leaving the note
 * to go and find an address. So `@` opens the map where the cursor is.
 *
 * The state is small and all of it is about one question -- is a name
 * being typed right now, and where. Everything else is either a pure
 * reading of a string (`lib/mentions`) or a pure ordering of what came
 * back (`lib/mentionSearch`); what is left here is the part that has
 * to touch a live selection, which is the part that cannot be tested
 * without a browser.
 */

/** A name being typed, and where on the sheet it is being typed. */
interface Anchored extends Mention {
  node: Text
  left: number
  top: number
}

/** Long enough that a fast typist is not searched on every letter,
 *  short enough that the menu feels like it is keeping up. */
const SETTLE = 120

export function useMentions(
  box: RefObject<HTMLDivElement | null>,
  /** Called after a name is written in, so the box can report itself. */
  onInserted: () => void
) {
  const [at, setAt] = useState<Anchored | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [active, setActive] = useState(0)

  const close = useCallback(() => {
    setAt(null)
    setSuggestions([])
    setActive(0)
  }, [])

  /** Read the cursor, and say whether a name is being typed under it. */
  const read = useCallback(() => {
    const el = box.current
    const selection = document.getSelection()
    if (!el || !selection?.isCollapsed) return close()

    const node = selection.anchorNode
    if (!node || node.nodeType !== 3 || !el.contains(node)) return close()

    const text = node as Text
    // Inside a name already chosen. Editing the words of a tag is not
    // typing a new one, and offering a menu there would replace the
    // link the reader is standing in.
    if (text.parentElement?.closest('a')) return close()

    const found = mentionAt(text.data, selection.anchorOffset)
    if (!found) return close()

    // Under the `@` rather than under the cursor, so the menu does not
    // walk sideways across the sheet as the name is typed.
    const range = document.createRange()
    range.setStart(text, found.from)
    range.setEnd(text, found.from)
    const spot = range.getBoundingClientRect()
    const host = el.getBoundingClientRect()

    setAt({
      ...found,
      node: text,
      left: spot.left - host.left,
      top: spot.bottom - host.top,
    })
  }, [box, close])

  // The cursor moves for reasons other than typing -- an arrow key, a
  // click into the middle of a word -- and each of them changes
  // whether a name is being typed.
  useEffect(() => {
    document.addEventListener('selectionchange', read)
    return () => document.removeEventListener('selectionchange', read)
  }, [read])

  const query = at?.query ?? null

  useEffect(() => {
    if (query === null) return

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/mentions?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        })
        if (!res.ok) return
        const body = await res.json()
        setSuggestions(Array.isArray(body.suggestions) ? body.suggestions : [])
        setActive(0)
      } catch {
        // Abandoned for a newer keystroke, or the network is not
        // there. Either way the menu simply does not open.
      }
    }, SETTLE)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  /**
   * Write the chosen name in, over the `@` and everything typed after
   * it. Inserted as an anchor rather than as markdown: the box holds
   * HTML and the serialiser turns an anchor back into a link, so the
   * one form survives the round trip in both directions.
   */
  const choose = useCallback(
    (suggestion: Suggestion) => {
      const el = box.current
      if (!el || !at) return

      const selection = document.getSelection()
      const range = document.createRange()
      // The node may have been retyped since the menu opened, so the
      // end is clamped rather than trusted.
      range.setStart(at.node, Math.min(at.from, at.node.data.length))
      range.setEnd(at.node, Math.min(at.to, at.node.data.length))
      selection?.removeAllRanges()
      selection?.addRange(range)

      el.focus()
      document.execCommand(
        'insertHTML',
        false,
        // The trailing space is what takes the cursor out of the link:
        // without it the next word typed is swallowed by the anchor.
        `<a href="${attr(tagHref(suggestion.kind, suggestion.id))}">@${
          attr(suggestion.title)
        }</a>&nbsp;`
      )

      close()
      onInserted()
    },
    [at, box, close, onInserted]
  )

  /**
   * The keys the menu owns while it is open, and only those. Returns
   * whether it took the press, so the box can leave everything else
   * to the browser.
   */
  const onKeyDown = useCallback(
    (e: { key: string; preventDefault: () => void }): boolean => {
      if (!at || suggestions.length === 0) {
        // Escape closes a menu that is open with nothing in it too.
        if (at && e.key === 'Escape') {
          e.preventDefault()
          close()
          return true
        }
        return false
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setActive(i => (i + 1) % suggestions.length)
          return true
        case 'ArrowUp':
          e.preventDefault()
          setActive(i => (i - 1 + suggestions.length) % suggestions.length)
          return true
        case 'Enter':
        case 'Tab':
          e.preventDefault()
          choose(suggestions[active])
          return true
        case 'Escape':
          e.preventDefault()
          close()
          return true
        default:
          return false
      }
    },
    [active, at, choose, close, suggestions]
  )

  return {
    /** Where to print the menu, or null when nothing is being named. */
    at: at && suggestions.length > 0 ? { left: at.left, top: at.top } : null,
    suggestions,
    active,
    setActive,
    choose,
    close,
    onKeyDown,
    read,
  }
}

/** A value this module writes into markup itself, made safe to print. */
function attr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
