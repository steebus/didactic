/**
 * Where the marking furniture sits.
 *
 * Two things get placed against a passage: the panel that reads or
 * writes a mark, and -- on a touch screen -- the small button that
 * offers to keep what has just been selected. Both have the same two
 * ways of going wrong, off the bottom of the window or off the side of
 * the sheet, and both are placed from a rectangle the caller measured.
 *
 * The arithmetic is kept here, away from the DOM, because it is the
 * part worth being sure about: the callers pass plain boxes, so the
 * cases that only happen on a narrow screen can be written down as
 * tests rather than reproduced on a phone.
 */

/** A measured rectangle. `DOMRect` satisfies this. */
export interface Box {
  top: number
  bottom: number
  left: number
  right: number
}

/** The window the furniture has to stay inside. */
export interface Viewport {
  width: number
  height: number
}

/** A place to put a panel, in coordinates relative to the prose. */
export interface Spot {
  top: number
  left: number
  above: boolean
}

/** The gap between a passage and whatever is placed against it. */
const GAP = 8

/** `.composer` in Highlighter.module.css: min(24rem, 100vw - 2rem). */
const PANEL_WIDTH = 384
const PANEL_MARGIN = 32

/** Roughly what a composer stands, used only to choose a side. */
const PANEL_HEIGHT = 220

/** `.pins` in Highlighter.module.css, near enough to keep it on screen.
 *  Two buttons and the gap between them -- *Add mark* and *Make a
 *  cloze* -- padded as tightly as the labels allow, because this floats
 *  over a sentence the reader is still choosing. */
const PIN_WIDTH = 216
const PIN_HEIGHT = 40

const clamp = (n: number, low: number, high: number) =>
  Math.min(Math.max(n, low), Math.max(low, high))

/**
 * Place a panel against a passage, in coordinates relative to `root`.
 *
 * Below the passage, unless that would run off the bottom of the window
 * and there is room above -- a panel should never cover the words it is
 * about. Held inside the sheet horizontally, because a passage starting
 * near the right margin would otherwise push the panel off the side,
 * which on a phone widens the page rather than clipping.
 */
export function panelSpot(target: Box, root: Box, view: Viewport): Spot {
  const width = Math.min(PANEL_WIDTH, view.width - PANEL_MARGIN)
  const room = Math.max(0, root.right - root.left - width)
  const above =
    target.bottom + GAP + PANEL_HEIGHT > view.height &&
    target.top - root.top > PANEL_HEIGHT

  return {
    top: above ? target.top - root.top - GAP : target.bottom - root.top + GAP,
    left: clamp(target.left - root.left, 0, room),
    above,
  }
}

/**
 * Place what a selection is offered against it, in window coordinates
 * -- it floats over the page rather than sitting in it, so that it
 * survives the prose scrolling under it.
 *
 * Below the selection by preference: the phone draws its own callout
 * above one, and two buttons in the same place is a tap on the wrong
 * one.
 */
export function pinSpot(target: Box, view: Viewport): { top: number; left: number } {
  const below = target.bottom + GAP
  const fits = below + PIN_HEIGHT + GAP <= view.height

  return {
    top: fits ? below : Math.max(GAP, target.top - GAP - PIN_HEIGHT),
    left: clamp(target.left, GAP, view.width - PIN_WIDTH - GAP),
  }
}
