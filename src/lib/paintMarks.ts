/**
 * Draw the kept passages back onto the prose.
 *
 * A highlight stores its words, not an offset, because a lesson body is
 * written on demand and regenerable -- an offset into prose that has
 * been rewritten points at nothing. So finding it again is a text
 * search over the rendered nodes rather than a lookup.
 *
 * It walks the DOM after render instead of injecting markup into the
 * HTML string: the sanitiser is the one thing between a model's output
 * and the page, and nothing should be threaded past it. A mark that
 * cannot be found is simply not drawn -- the highlight still exists on
 * the topic sheet, which is where it does its real work.
 */

export interface PaintableMark {
  id: string
  quote: string
  prefix: string | null
  hasNote: boolean
}

/** Collapse the whitespace differences between stored text and rendered text. */
const normalise = (s: string) => s.replace(/\s+/g, ' ')

/**
 * Wrap every findable mark in the container.
 *
 * Returns the ids it managed to draw, so the caller can say how many
 * marks are on this page without claiming ones it could not place.
 */
export function paintMarks(
  root: HTMLElement,
  marks: PaintableMark[],
  onOpen: (id: string, at: { top: number; left: number; above: boolean }) => void
): Set<string> {
  const drawn = new Set<string>()

  // Existing marks come off first, so a repaint after a save does not
  // wrap a mark inside the last one.
  for (const old of Array.from(root.querySelectorAll('[data-mark]'))) {
    const parent = old.parentNode
    if (!parent) continue
    while (old.firstChild) parent.insertBefore(old.firstChild, old)
    parent.removeChild(old)
    parent.normalize()
  }

  for (const mark of marks) {
    const quote = normalise(mark.quote).trim()
    if (!quote) continue

    // Re-read the text nodes for every mark: wrapping one changes the
    // tree the next one has to search.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    let node: Node | null
    while ((node = walker.nextNode())) {
      // Never paint inside a mark already drawn, or inside a block's
      // own controls.
      if ((node.parentElement as HTMLElement | null)?.closest('[data-mark],button,textarea')) {
        continue
      }
      nodes.push(node as Text)
    }
    if (nodes.length === 0) continue

    // One string for the whole container, with an index back to the
    // node each character came from, so a quote spanning a bold word or
    // a link still matches.
    let flat = ''
    const map: Array<{ node: Text; offset: number }> = []
    for (const n of nodes) {
      const text = normalise(n.data)
      for (let i = 0; i < text.length; i++) map.push({ node: n, offset: i })
      flat += text
    }

    // The prefix disambiguates a quote that appears more than once.
    let start = -1
    if (mark.prefix) {
      const withPrefix = normalise(mark.prefix).trim()
      const anchored = flat.indexOf(withPrefix + quote)
      if (anchored !== -1) start = anchored + withPrefix.length
      // A prefix is a hint, not a requirement: it was captured against
      // a body that may since have been rewritten.
      if (start === -1) start = flat.indexOf(quote)
    } else {
      start = flat.indexOf(quote)
    }
    if (start === -1) continue

    const from = map[start]
    const to = map[start + quote.length - 1]
    if (!from || !to) continue

    // The flat string collapsed whitespace, so offsets are mapped back
    // through the same collapse rather than used raw.
    const range = document.createRange()
    try {
      range.setStart(from.node, realOffset(from.node, from.offset))
      range.setEnd(to.node, realOffset(to.node, to.offset) + 1)
    } catch {
      continue
    }

    const wrap = document.createElement('mark')
    wrap.dataset.mark = mark.id
    if (mark.hasNote) wrap.dataset.noted = 'true'
    wrap.tabIndex = 0
    wrap.setAttribute('role', 'button')
    wrap.setAttribute(
      'aria-label',
      mark.hasNote ? 'Marked passage with a note' : 'Marked passage'
    )

    const open = (e: Event) => {
      e.stopPropagation()
      const rect = wrap.getBoundingClientRect()
      const rootRect = root.getBoundingClientRect()
      // Below the passage, unless that would put the panel off the
      // bottom of the window -- then above it, so the panel never
      // covers the words it is about and never opens off-screen.
      const below = rect.bottom + 8
      const wantsAbove = below + 220 > window.innerHeight && rect.top - rootRect.top > 220
      onOpen(mark.id, {
        top: wantsAbove ? rect.top - rootRect.top - 8 : rect.bottom - rootRect.top + 8,
        left: Math.max(0, rect.left - rootRect.left),
        above: wantsAbove,
      })
    }
    wrap.addEventListener('click', open)
    wrap.addEventListener('keydown', e => {
      const key = (e as KeyboardEvent).key
      if (key === 'Enter' || key === ' ') {
        e.preventDefault()
        open(e)
      }
    })

    try {
      // surroundContents throws when the range straddles element
      // boundaries -- a quote running across a paragraph break, say.
      // Those are left unpainted rather than rewriting the tree.
      range.surroundContents(wrap)
      drawn.add(mark.id)
    } catch {
      continue
    }
  }

  return drawn
}

/**
 * Map an offset in the whitespace-collapsed text back to the real node.
 *
 * The flat string replaced every run of whitespace with one space, so a
 * position in it can sit further along in the original.
 */
function realOffset(node: Text, collapsedOffset: number): number {
  const raw = node.data
  let seen = 0
  let i = 0
  while (i < raw.length) {
    if (seen === collapsedOffset) return i
    if (/\s/.test(raw[i])) {
      while (i < raw.length && /\s/.test(raw[i])) i++
      seen++
    } else {
      i++
      seen++
    }
  }
  return Math.min(collapsedOffset, raw.length)
}
