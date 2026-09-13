/**
 * Draw the tended passages onto the prose.
 *
 * A sentence a cloze was cut from is shown in the lesson wearing a
 * quiet plum wash, so that reading a lesson again says which of its
 * sentences the garden is holding on to. Pressing one opens that card:
 * the reader can answer it, rewrite it or pull it up without leaving
 * the reading.
 *
 * It shares `paintPassages` with the marks, and the sharing is what
 * makes the two layers able to overlap. Neither skips the other's
 * wrappers, so a sentence that is both marked and tended is drawn
 * twice, in either order, with the same result.
 *
 * The wash is drawn **under** the words rather than over them and has
 * no background of its own on the line the mark's wash occupies -- see
 * `Highlighter.module.css`. That is the whole of "it must not interfere
 * with mark making": a tended passage still looks marked when it is
 * marked, and a selection over one still reads as a selection.
 */

import { paintPassages } from './paintPassages'

export interface PaintableCloze {
  id: string
  /** The passage the cloze was cut from, whole. */
  text: string
  prefix: string | null
}

/**
 * Wrap every findable cloze in the container.
 *
 * Returns the ids it managed to draw. A cloze whose sentence is no
 * longer in the body -- the lesson was written again -- is simply not
 * drawn; it is still due, and the Tend sheet is where it is met.
 */
export function paintClozes(
  root: HTMLElement,
  clozes: PaintableCloze[],
  onOpen: (id: string, piece: HTMLElement) => void
): string[] {
  return paintPassages(
    root,
    clozes.map(c => ({ id: c.id, quote: c.text, prefix: c.prefix })),
    {
      tag: 'span',
      attribute: 'cloze',
      // Its own wrappers and the blocks' controls, and deliberately not
      // `[data-mark]`: a marked sentence can be tended too. Inside a
      // formula only the `annotation` is skipped -- it is the TeX the
      // formula was set from, rendered nowhere; the set formula itself
      // is walked, or a cloze cut from a sentence with an equation in
      // it could never be drawn on its own lesson.
      skip: '[data-cloze],annotation,button,textarea',
      dress: (piece, first) => {
        if (first) {
          piece.tabIndex = 0
          piece.setAttribute('role', 'button')
          piece.setAttribute('aria-label', 'Tended passage — open its cloze')
        }
      },
      onOpen: (id, piece) => {
        // A press that ends a selection is not a press on the passage.
        // Marking works by selecting words and letting go, and letting
        // go inside a tended sentence would otherwise open a card over
        // the selection the reader was in the middle of making.
        const selection = window.getSelection()
        if (selection && !selection.isCollapsed) return
        onOpen(id, piece)
      },
    }
  )
}
