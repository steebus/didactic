import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  colour, colourDark, plate, plateDark, scale, space, motion, graph, graphDark, measure,
} from '../src/index'

/**
 * The stylesheet is the source of truth; this module restates it.
 *
 * The failure this guards is silent and slow: someone adjusts an ink in
 * `globals.css`, the web repaints, and the phone goes on printing the
 * old one until somebody notices two screenshots disagree. There is no
 * runtime that would catch it, because the two platforms never read the
 * same file. So it is caught here instead.
 */

const CSS = join(
  import.meta.dirname, '..', '..', '..',
  'apps', 'web', 'src', 'app', 'globals.css'
)

/**
 * Every `--x: y` inside a `:root { ... }` block, per theme.
 *
 * There is more than one such block -- `--notes-width` lives in its own
 * -- so every one is read rather than just the first. Comments are
 * stripped first: they contain colons and braces of their own.
 *
 * Since the sheet gained a second lighting condition the blocks no
 * longer say one thing. A bare `:root` is the light theme; a `:root`
 * carrying `[data-theme='dark']`, or sitting inside a
 * `prefers-color-scheme: dark` query, restates the colours for the dark
 * one. Merging them, as this did when there was only one, would read
 * the dark palette as drift and fail every colour in the module.
 *
 * The brace matching is deliberately naive -- `[^}]*` -- because every
 * `:root` body in this stylesheet is flat. The media query wrapping one
 * of them is handled by matching the inner block directly rather than
 * by trying to parse the nesting.
 */
function rootProperties(css: string, theme: 'light' | 'dark'): Map<string, string> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out = new Map<string, string>()

  // Everything inside a `prefers-color-scheme: dark` query, cut out
  // first so the blocks left behind are unambiguously the light ones.
  // The query wraps a `:root` block, so it is matched to the second
  // closing brace rather than the first.
  const DARK_QUERY = /@media[^{]*prefers-color-scheme:\s*dark[^{]*\{([\s\S]*?\})\s*\}/g
  const queried = [...withoutComments.matchAll(DARK_QUERY)].map(m => m[1]).join('\n')
  const unqueried = withoutComments.replace(DARK_QUERY, '')

  // `:root`, plus whatever selector qualifies it, up to its brace.
  const read = (source: string, wanted: boolean) => {
    for (const [, qualifier, body] of source.matchAll(/:root([^{]*)\{([^}]*)\}/g)) {
      // A block guarded against an explicit light choice is still the
      // dark palette; one naming dark outright obviously is.
      const isDark = wanted || qualifier.includes("data-theme='dark'")
      if (isDark !== (theme === 'dark')) continue

      for (const line of body.split(';')) {
        const match = line.match(/\s*(--[a-z0-9-]+)\s*:\s*([\s\S]+)/i)
        if (match) out.set(match[1], match[2].trim().replace(/\s+/g, ' '))
      }
    }
  }

  read(unqueried, false)
  read(queried, true)
  return out
}

const css = readFileSync(CSS, 'utf8')
const props = rootProperties(css, 'light')
const dark = rootProperties(css, 'dark')

/**
 * What this module claims, against the custom property it claims it from.
 *
 * Font families are absent deliberately: they resolve through other
 * custom properties the web's loader sets, so there is no value here for
 * a phone to agree with.
 */
const CLAIMS: Array<[string, string]> = [
  ['--paper', colour.paper],
  ['--paper-deep', colour.paperDeep],
  ['--paper-edge', colour.paperEdge],
  ['--press-bed', colour.pressBed],
  ['--ink', colour.ink],
  ['--ink-soft', colour.inkSoft],
  ['--ink-faint', colour.inkFaint],
  ['--rule', colour.rule],
  ['--rule-strong', colour.ruleStrong],
  ['--plate-green', plate.green],
  ['--plate-terracotta', plate.terracotta],
  ['--plate-mustard', plate.mustard],
  ['--plate-ultramarine', plate.ultramarine],
  ['--plate-plum', plate.plum],
  ['--plate-olive', plate.olive],
  ['--step--2', scale['-2'].rem],
  ['--step--1', scale['-1'].rem],
  ['--step-0', scale['0'].rem],
  ['--step-1', scale['1'].rem],
  ['--step-2', scale['2'].rem],
  ['--step-3', scale['3'].rem],
  ['--step-4', scale['4'].rem],
  ['--space-1', space[1].rem],
  ['--space-2', space[2].rem],
  ['--space-3', space[3].rem],
  ['--space-4', space[4].rem],
  ['--space-5', space[5].rem],
  ['--space-6', space[6].rem],
  ['--motion-travel', String(motion.travel)],
  ['--dur-feedback', `${motion.feedback}ms`],
  ['--dur-state', `${motion.state}ms`],
  ['--dur-settle', `${motion.settle}ms`],
  ['--ease-settle', `cubic-bezier(${motion.ease.settle.join(', ')})`],
  ['--ease-exit', `cubic-bezier(${motion.ease.exit.join(', ')})`],
  ['--sheet-max', measure.sheetMax],
  ['--notes-width', measure.notesWidth],
]

/**
 * The same, for the dark block. Colours only: the scale, the spacing
 * and the timing are not restated after dark, and a dark block that
 * started restating them would be saying the sheet changes size in a
 * dark room.
 */
const DARK_CLAIMS: Array<[string, string]> = [
  ['--paper', colourDark.paper],
  ['--paper-deep', colourDark.paperDeep],
  ['--paper-edge', colourDark.paperEdge],
  ['--press-bed', colourDark.pressBed],
  ['--ink', colourDark.ink],
  ['--ink-soft', colourDark.inkSoft],
  ['--ink-faint', colourDark.inkFaint],
  ['--rule', colourDark.rule],
  ['--rule-strong', colourDark.ruleStrong],
  ['--plate-green', plateDark.green],
  ['--plate-terracotta', plateDark.terracotta],
  ['--plate-mustard', plateDark.mustard],
  ['--plate-ultramarine', plateDark.ultramarine],
  ['--plate-plum', plateDark.plum],
  ['--plate-olive', plateDark.olive],
]

describe('the tokens agree with globals.css', () => {
  it('finds the :root blocks', () => {
    expect(props.size).toBeGreaterThan(30)
  })

  it.each(CLAIMS)('%s', (property, claimed) => {
    expect(props.get(property)).toBe(claimed)
  })

  it('finds the dark block', () => {
    expect(dark.size).toBeGreaterThan(14)
  })

  it.each(DARK_CLAIMS)('after dark, %s', (property, claimed) => {
    expect(dark.get(property)).toBe(claimed)
  })

  /**
   * Every colour the light theme states, the dark theme restates.
   *
   * This is the check that actually keeps the two in step. A token
   * added to `:root` and forgotten in the dark block inherits the light
   * value, which is how a dark sheet ends up with one cream rule across
   * it -- visible to anyone looking, and invisible to every test that
   * only reads the block it was added to.
   */
  it('restates every colour after dark', () => {
    const colours = [...props.keys()].filter(
      p => /^--(paper|press-bed|ink|plate|rule|on-plate|band)/.test(p)
    )
    const missing = colours.filter(p => !dark.has(p))
    expect(missing).toEqual([])
  })

  /**
   * The other direction: a property added to the stylesheet that nothing
   * here restates. Not every one belongs in the module -- the font
   * families do not -- so those are named rather than the check dropped.
   */
  it('restates every custom property, or says why not', () => {
    const NOT_TOKENS = new Set([
      // Resolve through the web's font loader; the faces are named in
      // guides/styling-on-mobile.md instead.
      '--font-display',
      '--font-text',
      // A measurement the bench writes at runtime, not a decision about
      // the design: it says how much room its notices are taking, so
      // the lesson reader's floating buttons can stand on top of them
      // where the two share a foot. The phone measures its own.
      '--bench-stack',
      // Ink and paper as bare `r, g, b` triples, so a scrim can be
      // written `rgba(var(--ink-rgb), 0.16)` and follow the theme. The
      // phone composites its own and has no use for the string.
      '--ink-rgb',
      '--paper-rgb',
      '--tooth-rgb',
      // Surfaces derived from a plate rather than decisions of their
      // own: what a masthead is filled with and what reverses out of
      // it. The phone builds these from `plate` directly.
      '--on-plate',
      '--on-accent',
      '--band-fill',
      '--band-text',
      // Plates washed over prose at alpha rather than printed flat, and
      // the bed's drill grid. Same reason as the two above: a triple,
      // not a colour the phone would read.
      '--on-plate-rgb',
      '--plate-plum-rgb',
      '--plate-mustard-rgb',
      '--drill-rgb',
    ])
    const claimed = new Set(CLAIMS.map(([property]) => property))
    const unaccounted = [...props.keys()]
      .filter(p => !claimed.has(p) && !NOT_TOKENS.has(p))
    expect(unaccounted).toEqual([])
  })

  /** px values are the rem values at a 16px root, and must stay so. */
  it.each([
    [scale['-2'].rem, scale['-2'].px],
    [scale['-1'].rem, scale['-1'].px],
    [scale['0'].rem, scale['0'].px],
    [scale['1'].rem, scale['1'].px],
    [scale['2'].rem, scale['2'].px],
    [scale['3'].rem, scale['3'].px],
    [space[1].rem, space[1].px],
    [space[2].rem, space[2].px],
    [space[3].rem, space[3].px],
    [space[4].rem, space[4].px],
    [space[5].rem, space[5].px],
    [space[6].rem, space[6].px],
  ])('%s is %ipx at a 16px root', (rem, px) => {
    expect(parseFloat(rem) * 16).toBe(px)
  })

  /** The bed's own inks are not in :root; they are checked for shape. */
  it('carries the graph inks', () => {
    expect(graph.unfiledSeed).toMatch(/^#[0-9a-f]{6}$/)
    expect(graph.label).toBe(colour.ink)
    expect(graphDark.label).toBe(colourDark.ink)
  })

  /**
   * The bed fades every seed toward the ground it is drawn on, and a
   * canvas cannot read a custom property -- so this is the one colour
   * the stylesheet and the drawing have to agree about by hand.
   */
  it.each([
    ['light', graph.ground, colour.paper],
    ['dark', graphDark.ground, colourDark.paper],
  ])('the %s bed fades toward its own paper', (_theme, ground, paper) => {
    const hex = '#' + ground.map(c => c.toString(16).padStart(2, '0')).join('')
    expect(hex).toBe(paper)
  })
})
