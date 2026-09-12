/**
 * Draw the kept passages back onto the prose.
 *
 * The finding and wrapping is `paintPassages`, which the tended
 * passages share: a mark and a cloze are the same problem -- a passage
 * stored as words rather than as an offset -- and differ only in what
 * is wrapped round the words and what pressing it does. What is left
 * here is the mark's own half of that: a `<mark>` element, an id under
 * `data-mark`, a label that says whether a note came with it, and a
 * panel placed against the words when it is pressed.
 */

import { panelSpot } from '@didactic/core/markAnchor'
import { paintPassages } from './paintPassages'

export interface PaintableMark {
  id: string
  quote: string
  prefix: string | null
  hasNote: boolean
}

/**
 * Wrap every findable mark in the container.
 *
 * Returns the ids it managed to draw, in the order they come in the
 * reading rather than the order they were handed over -- the caller can
 * then say how many marks are on the page without claiming ones it
 * could not place, and list them the way the lesson reads.
 */
export function paintMarks(
  root: HTMLElement,
  marks: PaintableMark[],
  onOpen: (id: string, at: { top: number; left: number; above: boolean }) => void
): string[] {
  const noted = new Set(marks.filter(m => m.hasNote).map(m => m.id))

  return paintPassages(root, marks, {
    tag: 'mark',
    attribute: 'mark',
    // Never inside a mark already drawn, or inside a block's own
    // controls. A tended passage is deliberately absent: a sentence can
    // be marked and tended at once, and the two layers must not depend
    // on which of them ran last.
    skip: '[data-mark],button,textarea',
    dress: (piece, first) => {
      if (noted.has(piece.dataset.mark ?? '')) piece.dataset.noted = 'true'

      // One tab stop for the passage rather than one per piece: the
      // rest are still clickable, and none of them is hidden from a
      // screen reader, which would take the words with it.
      if (first) {
        piece.tabIndex = 0
        piece.setAttribute('role', 'button')
        piece.setAttribute(
          'aria-label',
          noted.has(piece.dataset.mark ?? '') ? 'Marked passage with a note' : 'Marked passage'
        )
      }
    },
    onOpen: (id, piece) =>
      onOpen(
        id,
        panelSpot(piece.getBoundingClientRect(), root.getBoundingClientRect(), {
          width: window.innerWidth,
          height: window.innerHeight,
        })
      ),
  })
}
