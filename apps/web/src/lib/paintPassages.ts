/**
 * Finding a stored passage in rendered prose, and wrapping it.
 *
 * The machinery two layers share. A mark and a cloze are the same
 * problem -- a passage stored as words rather than as an offset,
 * because a lesson body is written on demand and regenerable, so an
 * offset into prose that has been rewritten points at nothing -- and
 * they differ only in what is wrapped round the words and what pressing
 * it does.
 *
 * It walks the DOM after render instead of injecting markup into the
 * HTML string: the sanitiser is the one thing between a model's output
 * and the page, and nothing should be threaded past it. A passage that
 * cannot be found is simply not drawn -- a mark still exists on the
 * topic sheet and a cloze is still due on the Tend sheet, which is
 * where each does its real work.
 */

/** A passage to find, however it came to be stored. */
export interface Passage {
  id: string
  /** The words, as they read when they were kept. */
  quote: string
  /** Enough of what came before to tell two identical passages apart. */
  prefix: string | null
}

export interface PaintOptions {
  /** The element each piece is wrapped in: `mark`, `span`. */
  tag: string
  /** The data attribute that carries the id: `mark`, `cloze`. */
  attribute: string
  /**
   * Text this layer must not draw on, as a selector.
   *
   * Always its own wrappers -- drawing a passage inside one already
   * drawn nests them -- and always the controls a block renders. Never
   * the *other* layer: a sentence can be marked and tended at once, and
   * refusing to draw one because the other got there first would make
   * the two layers depend on which ran last.
   */
  skip: string
  /** Anything else to put on a piece: a label, a state. */
  dress?: (piece: HTMLElement, first: boolean) => void
  /** What pressing the passage does. */
  onOpen?: (id: string, piece: HTMLElement) => void
}

/** Collapse the whitespace differences between stored text and rendered text. */
const normalise = (s: string) => s.replace(/\s+/g, ' ')

/**
 * Wrap every findable passage in the container.
 *
 * Returns the ids it managed to draw, in the order they come in the
 * reading rather than the order they were handed over -- the caller can
 * then say how many are on the page without claiming ones it could not
 * place, and list them the way the lesson reads.
 */
export function paintPassages(
  root: HTMLElement,
  passages: Passage[],
  options: PaintOptions
): string[] {
  const { tag, attribute, skip } = options
  const drawn = new Set<string>()
  const selector = `[data-${attribute}]`

  // Existing pieces come off first, so a repaint after a save does not
  // wrap a passage inside the last one.
  for (const old of Array.from(root.querySelectorAll(selector))) {
    const parent = old.parentNode
    if (!parent) continue
    while (old.firstChild) parent.insertBefore(old.firstChild, old)
    parent.removeChild(old)
    parent.normalize()
  }

  for (const passage of passages) {
    const quote = normalise(passage.quote).trim()
    if (!quote) continue

    // Re-read the text nodes for every passage: wrapping one changes
    // the tree the next one has to search.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    let node: Node | null
    while ((node = walker.nextNode())) {
      if ((node.parentElement as HTMLElement | null)?.closest(skip)) continue
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
      for (let i = 0; i < text.length; i++) {
        // Whitespace collapses across nodes as well as within them. The
        // gap between a paragraph and the list under it is a text node
        // of its own, so running the nodes together left two spaces
        // where the reader had selected one -- and the passage was then
        // looked for with one space and never found.
        if (text[i] === ' ' && flat.endsWith(' ')) continue
        map.push({ node: n, offset: i })
        flat += text[i]
      }
    }

    // The prefix disambiguates a quote that appears more than once.
    let start = -1
    if (passage.prefix) {
      const withPrefix = normalise(passage.prefix).trim()
      const anchored = flat.indexOf(withPrefix + quote)
      if (anchored !== -1) start = anchored + withPrefix.length
      // A prefix is a hint, not a requirement: it was captured against
      // a body that may since have been rewritten.
      if (start === -1) start = flat.indexOf(quote)
    } else {
      start = flat.indexOf(quote)
    }
    if (start === -1) continue

    // The nodes the passage runs through, and how much of each it
    // covers.
    //
    // A passage is wrapped a text node at a time rather than in one
    // piece. A single range around the whole thing is what the DOM
    // would prefer, but `surroundContents` refuses any range that
    // straddles an element boundary -- and a reader marking two bullets
    // or a sentence that carries on into the next paragraph makes
    // exactly that range. Those marks were dropped silently: kept on
    // the topic sheet, invisible on the lesson they were taken in.
    //
    // Wrapping each node's share separately never straddles anything,
    // and the pieces carry the same id, so the passage reads as one
    // thing and opens one panel however many elements it crosses.
    const slices: Array<{ node: Text; from: number; to: number }> = []
    for (let i = start; i < start + quote.length; i++) {
      const at = map[i]
      if (!at) break
      const last = slices[slices.length - 1]
      if (last && last.node === at.node) last.to = at.offset
      else slices.push({ node: at.node, from: at.offset, to: at.offset })
    }
    if (slices.length === 0) continue

    /** One piece of the passage, drawn and wired to open it. */
    const piece = (first: boolean) => {
      const wrap = document.createElement(tag)
      wrap.dataset[attribute] = passage.id
      options.dress?.(wrap, first)

      if (options.onOpen) {
        const open = (e: Event) => {
          e.stopPropagation()
          options.onOpen?.(passage.id, wrap)
        }
        wrap.addEventListener('click', open)
        wrap.addEventListener('keydown', e => {
          const key = (e as KeyboardEvent).key
          if (key === 'Enter' || key === ' ') {
            e.preventDefault()
            open(e)
          }
        })
      }
      return wrap
    }

    // From the end back: wrapping part of a text node splits it, and
    // everything after the split moves. Working backwards leaves the
    // offsets this loop has not reached yet where it found them.
    for (let i = slices.length - 1; i >= 0; i--) {
      const slice = slices[i]
      // The flat string collapsed whitespace, so offsets are mapped
      // back through the same collapse rather than used raw.
      const from = realOffset(slice.node, slice.from)
      const to = realOffset(slice.node, slice.to) + 1

      // The gaps between elements are text nodes too -- the newline
      // between two list items is one. There is nothing to draw on
      // them, and a wrapper around a line break draws a wash in the
      // margin between the items.
      if (!slice.node.data.slice(from, to).trim()) continue

      const range = document.createRange()
      try {
        range.setStart(slice.node, from)
        range.setEnd(slice.node, to)
      } catch {
        continue
      }

      try {
        // Within one text node, so this cannot straddle anything.
        range.surroundContents(piece(i === 0))
        drawn.add(passage.id)
      } catch {
        continue
      }
    }
  }

  // Read back off the page rather than kept as they were painted: a
  // passage is drawn where its words are, which has nothing to do with
  // the order the sheet handed them over in.
  const order: string[] = []
  for (const piece of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
    const id = piece.dataset[attribute]
    if (id && drawn.has(id) && !order.includes(id)) order.push(id)
  }
  return order
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
