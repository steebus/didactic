import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { colour, plate, scale, space, motion, graph, measure } from '../src/index'

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
 * Every `--x: y` inside a `:root { ... }` block.
 *
 * There is more than one such block -- `--notes-width` lives in its own
 * -- so every one is read rather than just the first. Comments are
 * stripped first: they contain colons and braces of their own.
 */
function rootProperties(css: string): Map<string, string> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out = new Map<string, string>()
  const blocks = withoutComments.matchAll(/:root\s*\{([^}]*)\}/g)
  for (const [, body] of blocks) {
    for (const line of body.split(';')) {
      const match = line.match(/\s*(--[a-z0-9-]+)\s*:\s*([\s\S]+)/i)
      if (match) out.set(match[1], match[2].trim().replace(/\s+/g, ' '))
    }
  }
  return out
}

const props = rootProperties(readFileSync(CSS, 'utf8'))

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

describe('the tokens agree with globals.css', () => {
  it('finds the :root blocks', () => {
    expect(props.size).toBeGreaterThan(30)
  })

  it.each(CLAIMS)('%s', (property, claimed) => {
    expect(props.get(property)).toBe(claimed)
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
  })
})
