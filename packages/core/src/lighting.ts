/**
 * The three lights a sheet can be read under, and the forms that stand
 * for them.
 *
 * The choice itself is old -- an explicit one stamps `data-theme` on
 * the root, the default stamps nothing and follows the reader's own
 * system -- and it lived at the foot of the subjects sheet as three
 * words, *System · Daylight · After dark*. Three words at the foot of
 * one sheet is a setting you have to already know about to find, and
 * the sheet it was on is the one nobody is on when the room gets dark:
 * a reader is in a lesson, or in the garden, at the hour this matters.
 *
 * So it is at the foot of every sheet now, and it is drawn rather than
 * written, because three glyphs take the room a line of prose would
 * and because what is being chosen is a *condition* rather than a
 * word. The forms are one disc under three conditions and not three
 * unrelated pictures: a disc with rays, a disc bitten to a crescent,
 * and a disc half lit, which is the honest picture of *I have not
 * said, ask the room*. The half-lit one is drawn at the crescent's
 * radius rather than the sun's, because the sun carries rays and the
 * other two do not: matched on the circle alone, the row read as three
 * marks of three different sizes.
 *
 * Here rather than in the component for the reason `specimens` is
 * here: the web draws these with `<svg>` and the phone will draw them
 * with `react-native-svg`, so the elements cannot be shared, but the
 * geometry and the words must be or the same setting wears a different
 * face on each platform.
 */

/**
 * Which light, as the choice is stored rather than as the document is
 * stamped.
 *
 * Three rather than two, and `system` is one of them rather than the
 * absence of the other two. A toggle that only flipped between two
 * fixed states would quietly overrule a reader whose machine turns
 * dark in the evening, the first time it was touched, with no way back
 * -- and "follow the room" is a stated preference, not a missing one.
 *
 * The web maps `system` to a `null` in `localStorage`, because storing
 * nothing is how a default stays a default when this list changes. The
 * mapping is the storage's business; this is what the reader chose.
 */
export type Lighting = 'system' | 'light' | 'dark'

/** The three, in the order they are offered: the default first, then
 *  the two explicit ones in the order of a day. */
export const LIGHTINGS = ['system', 'light', 'dark'] as const

/** What each is called where it is printed as a word -- the phone's
 *  settings list, and the title on the web's glyph. */
export const LIGHTING_LABEL: Record<Lighting, string> = {
  system: 'System',
  light: 'Daylight',
  dark: 'After dark',
}

/**
 * What each glyph announces to a reader who cannot see it.
 *
 * Not the label. A control whose whole face is a drawing has no
 * visible text to lean on, so the accessible name is doing the work
 * the word used to do and "System" on its own does not say what it
 * would do. These are sentences because they are read as sentences.
 */
export const LIGHTING_NOTE: Record<Lighting, string> = {
  system: 'Follow the room',
  light: 'Read under daylight',
  dark: 'Read after dark',
}

/** The box every form below is drawn in, square, as `specimens` does. */
export const LIGHTING_BOX = 24

/** The middle of that box, which the rays turn about. */
export const LIGHTING_CENTRE = 12

/**
 * One drawn form: an outline, what is filled inside it, and the rays
 * turned about the centre.
 *
 * `fill` is null on two of the three and that is the point of it --
 * the disc is an outline under daylight and after dark, and the half
 * that is inked is the only thing marking the middle setting out.
 */
export interface LightingGlyph {
  /** The closed path that is stroked. */
  outline: string
  /** The closed path that is inked solid, where there is one. */
  fill: string | null
  /** Where the rays stand, in degrees clockwise from noon. */
  rays: readonly number[]
}

/**
 * One ray, drawn at noon and turned about the centre to reach the
 * other seven. Eight rather than twelve: at the size this is read at,
 * twelve closes into a ring.
 */
export const LIGHTING_RAY = 'M12 4.4 L 12 2'

/** Where those rays stand. */
const RAYS = [0, 45, 90, 135, 180, 225, 270, 315] as const

/** The sun's own disc, radius 5, which the rays stand off. Small,
 *  because the rays are half of what makes a sun a sun and the mark as
 *  a whole has to sit in the same room as the other two. */
const SUN_DISC = 'M12 7 A 5 5 0 1 0 12 17 A 5 5 0 1 0 12 7 Z'

/** The moon's circle before the bite is taken out of it, radius 8.
 *  The system glyph is this disc, half lit: the same circle the
 *  crescent is cut from, which is what stops the row reading as three
 *  marks of three different sizes. */
const WHOLE_DISC = 'M12 4 A 8 8 0 1 0 12 20 A 8 8 0 1 0 12 4 Z'

export const LIGHTING_GLYPHS: Record<Lighting, LightingGlyph> = {
  /**
   * A disc with half of it inked: whatever the room is. Half rather
   * than a third form of its own, because the setting is not a third
   * light -- it is the other two, deferred to, and half a disc is the
   * picture of that.
   */
  system: {
    outline: WHOLE_DISC,
    fill: 'M12 4 A 8 8 0 0 1 12 20 Z',
    rays: [],
  },
  /** The disc with its rays out. */
  light: {
    outline: SUN_DISC,
    fill: null,
    rays: RAYS,
  },
  /**
   * The disc bitten to a crescent: a circle of radius 8 with one of
   * radius 6.9 taken out of it, the two centres far enough apart to
   * leave a limb that still reads at sixteen pixels.
   */
  dark: {
    outline: 'M19.8 13.9 A 8 8 0 1 1 10 4.2 A 6.9 6.9 0 0 0 19.8 13.9 Z',
    fill: null,
    rays: [],
  },
}
