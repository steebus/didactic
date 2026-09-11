/**
 * The design tokens, as TypeScript.
 *
 * `apps/web/src/app/globals.css` is the source of truth: it is what the
 * browser actually paints, and this module restates it so the phone can
 * read the same values without a stylesheet. The agreement test in
 * `tests/agreement.test.ts` parses that file's `:root` blocks and fails
 * if any `--` property here has drifted from it.
 *
 * Only values a second platform can use live here. `--font-display` and
 * `--font-text` are deliberately absent: they resolve through other
 * custom properties that the web's font loader sets, which is a
 * rendering concern rather than a token. The faces themselves are named
 * in `guides/styling-on-mobile.md`.
 */

/** Ground, ink and rules: everything that is not a plate. */
export const colour = {
  paper: '#efe7d6',
  paperDeep: '#e3d8c2',
  paperEdge: '#d5c8ae',
  pressBed: '#ddd2ba',
  ink: '#241d16',
  inkSoft: '#574a3b',
  inkFaint: '#6b5c45',
  rule: '#b9a988',
  ruleStrong: '#6b5c45',
} as const

/**
 * The six plate inks, in assignment order.
 *
 * A subject is given the next plate along, so the order is data rather
 * than decoration: changing it repaints every existing bed.
 */
export const plates = [
  '#2f5233', // green
  '#b8482a', // terracotta
  '#c8871a', // mustard
  '#2a4a7c', // ultramarine
  '#6b3550', // plum
  '#6b7233', // olive
] as const

/** The same six by name, for the places that ask for one in particular. */
export const plate = {
  green: '#2f5233',
  terracotta: '#b8482a',
  mustard: '#c8871a',
  ultramarine: '#2a4a7c',
  plum: '#6b3550',
  olive: '#6b7233',
} as const

/**
 * The type scale, in rem as the CSS states it and in px at a 16px root.
 *
 * React Native has no rem, so the phone reads `px`; the web keeps `rem`
 * so a reader's own text size still scales the sheet. `step4` is a
 * clamp and has no single px value -- its bounds are given instead.
 */
export const scale = {
  '-2': { rem: '0.6875rem', px: 11 },
  '-1': { rem: '0.8125rem', px: 13 },
  '0': { rem: '0.9375rem', px: 15 },
  '1': { rem: '1.25rem', px: 20 },
  '2': { rem: '1.75rem', px: 28 },
  '3': { rem: '2.5rem', px: 40 },
  '4': { rem: 'clamp(3rem, 6vw, 5rem)', px: { min: 48, max: 80 } },
} as const

/** Spacing, rem as written and px at 16. */
export const space = {
  1: { rem: '0.25rem', px: 4 },
  2: { rem: '0.5rem', px: 8 },
  3: { rem: '0.875rem', px: 14 },
  4: { rem: '1.375rem', px: 22 },
  5: { rem: '2.25rem', px: 36 },
  6: { rem: '3.5rem', px: 56 },
} as const

/**
 * Timing and easing.
 *
 * `travel` scales every spatial movement, so a reduced-motion setting
 * can drop distance to zero while colour and opacity still confirm that
 * something happened. Durations are milliseconds: the phone's animation
 * driver wants numbers, the web's CSS wants the string.
 */
export const motion = {
  travel: 2.2,
  feedback: 140,
  state: 300,
  settle: 620,
  ease: {
    settle: [0.16, 1, 0.3, 1],
    exit: [0.4, 0, 1, 1],
  },
} as const

/**
 * Text on a plate band is paper at alpha, never a different hue.
 *
 * The steps are the alphas in use; `at` builds the colour, because a
 * band that reaches for a lighter grey instead is the drift this exists
 * to prevent.
 */
export const reversed = {
  base: [239, 231, 214],
  steps: [0.7, 0.75, 0.85, 0.88, 0.9],
  at: (alpha: number) => `rgba(239, 231, 214, ${alpha})`,
} as const

/** Inks the bed uses and nothing else does. */
export const graph = {
  unfiledSeed: '#7d6f5d',
  edge: 'rgba(90, 76, 56, 0.62)',
  membershipEdge: 'rgba(90, 76, 56, 0.10)',
  label: '#241d16',
  labelDormant: '#8a7d68',
} as const

/** Measures that are a single value rather than a surface's own business. */
export const measure = {
  sheetMax: '1240px',
  notesWidth: 'min(28rem, 42vw)',
} as const
