/**
 * A place in the reading on the page: from a point on the screen to the
 * words there, and from the words back to how far down the prose they
 * are.
 *
 * The words are what is kept (`core/bookmarks`), so both halves run
 * through one flattening of the page's text -- the same flattening the
 * mark painter does, and skipping the same things: the reader's own
 * writing set into the prose, and the controls.
 */

import { findPlace, placeAt, type Place } from '@didactic/core/bookmarks'

const SKIP = '[data-summary-host],button,textarea,annotation'

const normalise = (s: string) => s.replace(/\s+/g, ' ')

interface Flat {
  flat: string
  /** For every character of `flat`, the node it came from and where in
   *  that node's collapsed text. */
  map: Array<{ node: Text; offset: number }>
}

function flatten(root: HTMLElement): Flat {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let flat = ''
  const map: Flat['map'] = []
  let node: Node | null
  while ((node = walker.nextNode())) {
    if ((node.parentElement as HTMLElement | null)?.closest(SKIP)) continue
    const text = normalise((node as Text).data)
    for (let i = 0; i < text.length; i++) {
      if (text[i] === ' ' && (flat.length === 0 || flat.endsWith(' '))) continue
      map.push({ node: node as Text, offset: i })
      flat += text[i]
    }
  }
  return { flat, map }
}

/** Whether there is any reading on the page yet to find a place in. */
export function hasText(root: HTMLElement): boolean {
  return flatten(root).flat.trim().length > 0
}

/** The text node and offset under a point, where the browser can say. */
function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const d = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y)
    return p ? { node: p.offsetNode, offset: p.offset } : null
  }
  const r = d.caretRangeFromPoint?.(x, y)
  return r ? { node: r.startContainer, offset: r.startOffset } : null
}

/**
 * The place at a point in the window, or null where there is no reading
 * under it.
 *
 * A point between two paragraphs lands on no text, so the line is tried
 * a little further down until it meets some: a bookmark dropped in the
 * gap above a paragraph belongs to that paragraph.
 */
export function placeFromPoint(root: HTMLElement, x: number, y: number): Place | null {
  const box = root.getBoundingClientRect()
  if (y < box.top || y > box.bottom) return null
  const { flat, map } = flatten(root)
  if (!flat) return null

  for (let tries = 0, line = y; tries < 12 && line <= box.bottom; tries++, line += 8) {
    const caret = caretAt(x, line)
    if (!caret || !root.contains(caret.node)) continue

    let index = -1
    if (caret.node.nodeType === Node.TEXT_NODE) {
      const upTo = normalise((caret.node as Text).data.slice(0, caret.offset)).length
      index = map.findIndex(m => m.node === caret.node && m.offset >= upTo)
      if (index === -1) index = map.findIndex(m => m.node === caret.node)
    } else {
      index = map.findIndex(m => caret.node.contains(m.node))
    }
    if (index === -1) continue

    return placeAt(flat, index, (line - box.top) / Math.max(1, box.height))
  }
  return null
}

/** Map an offset in a node's collapsed text back to its real text. */
function realOffset(node: Text, collapsed: number): number {
  const raw = node.data
  let seen = 0
  let i = 0
  while (i < raw.length) {
    if (seen === collapsed) return i
    if (/\s/.test(raw[i])) while (i < raw.length && /\s/.test(raw[i])) i++
    else i++
    seen++
  }
  return raw.length
}

/**
 * How far down the prose a place is, in pixels from its top: where its
 * words are, or -- where they have gone -- as far down as it was.
 */
export function offsetOf(root: HTMLElement, place: Place): number {
  const box = root.getBoundingClientRect()
  const { flat, map } = flatten(root)
  const at = map[findPlace(flat, place)]
  if (at) {
    const range = document.createRange()
    const offset = realOffset(at.node, at.offset)
    range.setStart(at.node, offset)
    range.setEnd(at.node, Math.min(offset + 1, at.node.data.length))
    const rect = range.getBoundingClientRect()
    if (rect.height > 0) return rect.top - box.top
  }
  return place.at * box.height
}
