/**
 * The drawn forms, as data rather than as markup.
 *
 * The web draws these with `<svg>` and the phone will draw them with
 * `react-native-svg`, so the elements cannot be shared -- but the paths,
 * the stage names and the rule for which plate a subject gets must be,
 * or the same subject grows a different specimen on each platform.
 */

/**
 * A title reduced to the key its plate is chosen by.
 *
 * Ampersands go rather than becoming "and": the slug is an identity, not
 * a reading, and "arts-crafts" must stay itself across both platforms.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Which specimen a slug draws, when it has no plate of its own.
 *
 * FNV-1a over the slug, modulo the number of specimens: the same
 * subject gets the same form for ever, on both platforms, with no table
 * to keep in step. A hash rather than an index because subjects are
 * added and removed, and a positional choice would reshuffle the lot.
 */
export function specimenIndex(slug: string, count: number): number {
  let n = 2166136261
  for (let i = 0; i < slug.length; i++) {
    n ^= slug.charCodeAt(i)
    n = Math.imul(n, 16777619) >>> 0
  }
  return n % count
}

/**
 * The six stages of the roots gauge: what a sower says they already
 * hold, and what the sheet says back.
 */
export const ROOT_STAGES = [
  { label: 'Bare ground', note: 'Nothing sown. No prior knowledge at all.' },
  { label: 'Just germinated', note: 'You know the words. Nothing has taken hold yet.' },
  { label: 'Seedling', note: 'You can follow a conversation about it and mostly keep up.' },
  { label: 'In leaf', note: 'You use it, with the documentation open beside you.' },
  {
    label: 'Well rooted',
    note: 'You work in it without looking much up, and you know where it bends.',
  },
  {
    label: 'In full flower',
    note: 'Mastery. You could teach it, and you know what the books get wrong.',
  },
] as const

export type RootStage = (typeof ROOT_STAGES)[number]

/**
 * How far the stem and the roots have drawn on at each stage, 0 to 1.
 *
 * Both platforms animate this the same way -- a dash offset retreating
 * along the path -- so the fractions are shared and the driver is not.
 */
export const STEM_GROWN = [0, 0.14, 0.34, 0.58, 0.8, 1] as const
export const ROOT_GROWN = [0, 0.16, 0.4, 0.62, 0.84, 1] as const

/** The specimen's own geometry, in a 140x220 viewBox. */
export const STEM = 'M70 126 C 66 108 74 84 70 58 C 68 44 70 36 70 26'
export const TAPROOT = 'M70 126 C 73 144 65 158 69 176 C 71 186 69 194 68 202'
export const LEAF = 'M0 0 C 9 -13 25 -16 34 -7 C 25 6 9 9 0 0 Z'
export const MIDRIB = 'M3 0 C 12 -3 22 -5 30 -6'
export const PETALS = [0, 60, 120, 180, 240, 300] as const

/**
 * Lateral roots, each appearing at its own notch. The system spreads as
 * well as deepens: a subject held well is held widely.
 */
export const LATERALS: ReadonlyArray<{ d: string; stage: number; width: number }> = [
  { d: 'M69 140 C 58 143 50 148 40 154', stage: 2, width: 2.2 },
  { d: 'M70 145 C 81 148 88 153 96 159', stage: 2, width: 2.2 },
  { d: 'M68 158 C 55 162 46 170 36 178', stage: 3, width: 2 },
  { d: 'M69 163 C 83 167 91 174 100 181', stage: 3, width: 2 },
  { d: 'M69 133 C 57 133 46 132 34 129', stage: 4, width: 1.8 },
  { d: 'M69 176 C 80 182 85 189 90 197', stage: 4, width: 1.8 },
  // Root hairs: the fine work that only a deep holding has.
  { d: 'M40 154 C 36 160 34 165 33 171', stage: 5, width: 1.1 },
  { d: 'M96 159 C 100 165 102 170 102 176', stage: 5, width: 1.1 },
  { d: 'M36 178 C 32 184 31 189 31 195', stage: 5, width: 1.1 },
  { d: 'M100 181 C 104 187 106 191 106 196', stage: 5, width: 1.1 },
  { d: 'M68 202 C 65 205 63 206 61 207', stage: 5, width: 1.1 },
]

/**
 * Leaves open in opposite pairs, each pair one notch further up the
 * stem than the last. `angle` is measured from the stem outward.
 */
export const LEAVES: ReadonlyArray<{
  x: number
  y: number
  angle: number
  scale: number
  stage: number
}> = [
  // Seed leaves: small, blunt, the first thing a seedling puts out.
  { x: 69, y: 104, angle: -18, scale: 0.5, stage: 2 },
  { x: 69, y: 104, angle: -162, scale: 0.5, stage: 2 },
  { x: 70, y: 86, angle: -28, scale: 0.72, stage: 3 },
  { x: 70, y: 86, angle: -152, scale: 0.72, stage: 3 },
  { x: 71, y: 66, angle: -32, scale: 0.88, stage: 4 },
  { x: 71, y: 66, angle: -148, scale: 0.88, stage: 4 },
  { x: 70, y: 48, angle: -42, scale: 0.64, stage: 5 },
  { x: 70, y: 48, angle: -138, scale: 0.64, stage: 5 },
]

/* ------------------------------------------------------- the timeline */

/**
 * The three forms the Marked timeline draws on its stem.
 *
 * The sheet is a vintage botanical plate: one stem running down the
 * page with specimens along it, each labelled and captioned. Which form
 * a row gets is what the row *is*, not decoration -- a sentence someone
 * kept is a leaf, their own thought about it is a bud, and a page
 * written about a week is the thing in flower. Three strands, three
 * forms, so the shape of a month can be read before a word of it is.
 *
 * Drawn in a 24x24 box. Paths here, elements in each front end, for the
 * reason the rest of this file gives: the web draws with `<svg>` and the
 * phone with `react-native-svg`, and the same mark must not grow a
 * different form on each.
 */
export const GLYPH_BOX = 24

export interface StrandGlyph {
  /** The body of the form, filled in ink. */
  outline: string
  /** Hairlines over it: veins, sepals, the stem it stands on. */
  detail: readonly string[]
  /** Petals, each an angle about the box's centre. Empty for a form
   *  that has none. */
  petals: readonly number[]
}

export const STRAND_GLYPHS: Record<'passage' | 'note' | 'entry', StrandGlyph> = {
  /** A leaf: a sentence kept off something that was read. */
  passage: {
    outline: 'M12 2.5 C 18.5 7 18.5 16.5 12 21.5 C 5.5 16.5 5.5 7 12 2.5 Z',
    detail: [
      'M12 4 L 12 20.5',
      'M12 8.5 L 8.4 6.6',
      'M12 8.5 L 15.6 6.6',
      'M12 13 L 7.8 11',
      'M12 13 L 16.2 11',
    ],
    petals: [],
  },
  /** A bud: the reader's own note, which is a thought not yet opened. */
  note: {
    outline: 'M12 3 C 16 6.5 16 11.5 12 14.5 C 8 11.5 8 6.5 12 3 Z',
    detail: [
      'M12 14.5 L 12 21.5',
      'M12 15.5 C 9.6 15 8.1 13.4 7.6 11.4',
      'M12 15.5 C 14.4 15 15.9 13.4 16.4 11.4',
    ],
    petals: [],
  },
  /** In flower: an entry, which is a page about a week rather than a
   *  line about a sentence. */
  entry: {
    outline: 'M12 9.4 C 13.4 9.4 14.6 10.6 14.6 12 C 14.6 13.4 13.4 14.6 12 14.6 C 10.6 14.6 9.4 13.4 9.4 12 C 9.4 10.6 10.6 9.4 12 9.4 Z',
    detail: ['M12 14.6 L 12 22'],
    petals: PETALS,
  },
}
