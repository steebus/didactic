/**
 * Mathematics in a lesson body.
 *
 * A lesson on logarithms is mostly notation, and a model asked to write
 * one writes TeX -- `$b^n$` in a sentence, `$$2^4 = 16$$` on a line of
 * its own. Printed as they arrive those are dollar signs and
 * backslashes in the middle of the prose, which is worse than no
 * notation at all: the reader has to decode what the lesson was trying
 * to show them.
 *
 * So the delimiters are tokenised before the markdown is rendered, and
 * each formula is typeset by KaTeX.
 *
 * **MathML, not KaTeX's HTML.** KaTeX's default output is a tree of
 * spans carrying inline styles and a stylesheet and four font files to
 * make them mean anything. Its MathML output is the same typesetting
 * expressed as elements the browser already knows how to set: no
 * styles, no classes, no assets, and -- the part that decides it -- a
 * bounded allowlist. The tags below are *only* ever mathematics. They
 * carry no URL, no script and no styling, so widening the sanitiser to
 * admit them widens nothing a model could reach through. Admitting
 * KaTeX's HTML would have meant admitting `style` on every element in
 * the prose, which is exactly the kind of hole `markdown.ts` exists to
 * refuse.
 *
 * KaTeX parses the TeX with `trust` left off, so `\href`, `\url` and
 * `\includegraphics` are refused at the source as well.
 */

import katex from 'katex'
import type { MarkedExtension, TokenizerAndRendererExtension } from 'marked'

/**
 * The MathML KaTeX emits, measured rather than remembered.
 *
 * Taken from its output over a corpus of the notation a lesson actually
 * uses -- powers, fractions, roots, sums, integrals, limits, matrices,
 * cases, accents, braces -- and then widened by the few elements that
 * corpus happened not to reach. Guessing this list is how a reader ends
 * up with a formula silently gutted into the text inside it.
 */
export const MATHML_TAGS = [
  'math', 'semantics', 'annotation',
  'mrow', 'mi', 'mn', 'mo', 'ms', 'mtext', 'mspace',
  'msup', 'msub', 'msubsup', 'msqrt', 'mroot', 'mfrac',
  'mover', 'munder', 'munderover', 'mmultiscripts', 'mprescripts', 'none',
  'mstyle', 'mpadded', 'mphantom', 'menclose', 'merror',
  'mtable', 'mtr', 'mtd', 'mlabeledtr',
]

/**
 * The attributes those elements carry.
 *
 * Presentational, every one of them: how wide a rule is, whether an
 * operator stretches, how a column is aligned. `mathcolor` and
 * `mathbackground` are deliberately absent -- KaTeX has no need of them
 * here, and the one thing a model should not be able to do to this
 * catalogue is choose its own ink.
 */
export const MATHML_ATTR = [
  'xmlns', 'display', 'encoding',
  'displaystyle', 'scriptlevel', 'mathvariant', 'mathsize',
  'stretchy', 'fence', 'separator', 'accent', 'accentunder', 'movablelimits',
  'largeop', 'symmetric', 'form', 'minsize', 'maxsize',
  'linethickness', 'notation', 'width', 'height', 'depth',
  'lspace', 'rspace', 'voffset',
  'columnalign', 'rowalign', 'columnspacing', 'rowspacing', 'columnlines', 'rowlines',
]

/**
 * Take KaTeX's wrapping `<span class="katex">` off.
 *
 * It exists to hang KaTeX's stylesheet on, and there is no stylesheet
 * here. Stripping it rather than allowing `span` and letting the
 * sanitiser drop the class keeps the allowlist to what a lesson may
 * actually contain -- a `<span>` nothing writes is a `<span>` a model
 * cannot borrow.
 */
function unwrap(html: string): string {
  const open = '<span class="katex">'
  return html.startsWith(open) && html.endsWith('</span>')
    ? html.slice(open.length, -'</span>'.length)
    : html
}

/** Escape what could not be typeset, so it prints as the reader's own
 *  text rather than as markup. */
const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Typeset one formula, or give the source back.
 *
 * A model writes TeX it has not compiled, so some of it will not
 * compile. The failure that matters is the silent one: a lesson with a
 * hole where an equation should be teaches less than a lesson showing
 * the equation as the writer typed it. So a formula KaTeX refuses is
 * printed verbatim, delimiters and all, which is exactly what the
 * reader would have seen before any of this existed.
 */
export function typeset(tex: string, display: boolean): string {
  try {
    return unwrap(katex.renderToString(tex, {
      output: 'mathml',
      displayMode: display,
      // Not `throwOnError: false`: that renders the error message into
      // the page in KaTeX's own colour, which needs the stylesheet this
      // whole approach exists to avoid shipping.
      throwOnError: true,
      // Nothing in a lesson may reach out of the formula it is in.
      trust: false,
      // A model's TeX is full of the small liberties strict mode
      // objects to -- a unicode minus, a stray `\over`. None of them is
      // worth refusing a formula over.
      strict: false,
    }))
  } catch {
    const fence = display ? '$$' : '$'
    return escape(`${fence}${tex}${fence}`)
  }
}

/**
 * `$$…$$` standing on its own, as a block.
 *
 * Block level so that an equation on its own line is a paragraph of its
 * own rather than a stray child of the sentence above it.
 */
const displayBlock: TokenizerAndRendererExtension = {
  name: 'mathBlock',
  level: 'block',
  start: (src: string) => src.indexOf('$$'),
  tokenizer(src: string) {
    // `[^$]` and not `[\s\S]+?`. Lazy matching still backtracks, so on
    // a line carrying three formulas one after another the lazy rule
    // eventually satisfies itself by swallowing all three -- delimiters
    // and all -- into one formula that KaTeX then refuses, and the
    // whole line prints as raw TeX. Refusing a `$` inside the formula
    // makes that match impossible, so the line falls through to the
    // inline rule below, which takes them one at a time.
    const match = /^\$\$([^$]+?)\$\$(?:\n+|$)/.exec(src)
    if (!match || !match[1].trim()) return undefined
    return { type: 'mathBlock', raw: match[0], text: match[1].trim() }
  },
  renderer: token => typeset(token.text, true),
}

/**
 * `$$…$$` met inside a line.
 *
 * A model that means three equations often writes them one after
 * another on a single line, which the block rule above cannot claim --
 * it requires the line to end at the closing delimiter. Without this
 * those pass through untouched, and a run of them is the worst case
 * there is: several formulas' worth of raw TeX in one paragraph.
 *
 * Still set as display, because `$$` is the writer saying *this is an
 * equation, not a phrase*, and where they meant it is a lesser question
 * than what they meant.
 */
const displayInline: TokenizerAndRendererExtension = {
  name: 'mathDisplayInline',
  level: 'inline',
  start: (src: string) => src.indexOf('$$'),
  tokenizer(src: string) {
    const match = /^\$\$([^$]+?)\$\$/.exec(src)
    if (!match || !match[1].trim()) return undefined
    return { type: 'mathDisplayInline', raw: match[0], text: match[1].trim() }
  },
  renderer: token => typeset(token.text, true),
}

/**
 * `$…$` inside a sentence.
 *
 * The guards are what keep prices out of it. `$5 and $10 later` is two
 * dollar signs and a sentence between them, and a naive rule turns it
 * into a formula reading "5 and ". So: no space after the opening
 * delimiter, no space before the closing one, no digit straight after
 * the close, and nothing but a single line in between -- a formula that
 * wraps a paragraph is not a formula.
 */
const inline: TokenizerAndRendererExtension = {
  name: 'mathInline',
  level: 'inline',
  start: (src: string) => src.indexOf('$'),
  tokenizer(src: string) {
    const match = /^\$(?![\s$])((?:\\.|[^$\\\n])*?)(?<![\s\\])\$(?!\d)/.exec(src)
    if (!match || !match[1].trim()) return undefined
    return { type: 'mathInline', raw: match[0], text: match[1].trim() }
  },
  renderer: token => typeset(token.text, false),
}

/**
 * The extension `marked` is built with.
 *
 * Order matters: `$$` is tried before `$`, or the inline rule claims
 * the first two delimiters of a display formula and leaves the rest of
 * it as prose.
 *
 * Being an extension rather than a pass over the string is what keeps a
 * dollar sign inside a code fence a dollar sign. By the time a
 * tokenizer runs, marked has already decided what is prose and what is
 * a specimen -- the same reasoning that lets `lesson:` links be
 * resolved in a renderer rather than in the markdown.
 */
export const maths: MarkedExtension = {
  extensions: [displayBlock, displayInline, inline],
}
