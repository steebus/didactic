import { describe, it, expect } from 'vitest'
import { renderInline, renderMarkdown, NOTE_TAGS } from '@/lib/markdown'
import { typeset } from '@/lib/maths'

/**
 * A lesson on logarithms is mostly notation.
 *
 * What is being held here is that the TeX a model writes reaches the
 * reader as mathematics, that the things which merely look like TeX do
 * not, and that a formula nobody could typeset still says what the
 * writer wrote rather than vanishing.
 */

/** The formula, as it will be spoken and copied. */
const sources = (html: string) =>
  Array.from(html.matchAll(/<annotation encoding="application\/x-tex">([^<]*)<\/annotation>/g))
    .map(m => m[1])

const formulas = (html: string) => (html.match(/<math/g) ?? []).length

/**
 * What is actually drawn.
 *
 * The `<annotation>` carries the TeX the writer typed so a formula can
 * be copied and read aloud; it is never rendered. Anything asked about
 * what reaches the reader has to be asked of the page without it.
 */
const drawn = (html: string) =>
  html.replace(/<annotation encoding="application\/x-tex">[^<]*<\/annotation>/g, '')
const displayed = (html: string) => (html.match(/display="block"/g) ?? []).length

describe('notation inside a sentence', () => {
  it('typesets it, and leaves the sentence alone', () => {
    const html = renderMarkdown('An expression like $b^n$ is shorthand.')
    expect(formulas(html)).toBe(1)
    expect(sources(html)).toEqual(['b^n'])
    expect(html).toContain('An expression like ')
    expect(html).toContain(' is shorthand.')
    // Inside a sentence, so not set as its own line.
    expect(displayed(html)).toBe(0)
  })

  it('takes several in one sentence', () => {
    const html = renderMarkdown('multiplying $b$ by itself, $n$ times')
    expect(sources(html)).toEqual(['b', 'n'])
  })

  it('never prints a dollar sign where it typeset one', () => {
    expect(renderMarkdown('like $b^n$ is')).not.toContain('$')
  })
})

describe('an equation on its own line', () => {
  it('is set as a block', () => {
    const html = renderMarkdown('Before.\n\n$$2^4 = 16$$\n\nAfter.')
    expect(displayed(html)).toBe(1)
    expect(sources(html)).toEqual(['2^4 = 16'])
  })

  it('takes the notation a lesson actually uses', () => {
    const tex = 'b^n = \\underbrace{b \\times b \\times \\cdots \\times b}_{n \\text{ times}}'
    const html = renderMarkdown(`$$${tex}$$`)
    expect(formulas(html)).toBe(1)
    expect(sources(html)).toEqual([tex])
    // The brace is real notation, not the word "underbrace".
    expect(html).not.toContain('underbrace<')
    expect(html).toContain('<munder')
  })

  it('sets a run of them jammed onto one line as three, not as one wall', () => {
    // What a model actually writes when it means three steps. A lazy
    // block rule satisfies itself by swallowing all three into one
    // formula, which KaTeX then refuses -- and the whole line prints as
    // raw TeX, which is the bug this covers.
    const html = renderMarkdown('$$3^1 = 3$$ $$3^2 = 9$$ $$3^3 = 27$$')
    expect(sources(html)).toEqual(['3^1 = 3', '3^2 = 9', '3^3 = 27'])
    expect(displayed(html)).toBe(3)
    expect(html).not.toContain('$$')
  })
})

describe('what only looks like notation', () => {
  it('leaves prices alone', () => {
    const html = renderMarkdown('It cost $5 and then $10 more.')
    expect(formulas(html)).toBe(0)
    expect(html).toContain('$5 and then $10 more')
  })

  it('leaves a dollar sign in a code fence alone', () => {
    const html = renderMarkdown('```js\nconst price = "$b^n$"\n```')
    expect(formulas(html)).toBe(0)
    expect(html).toContain('$b^n$')
  })

  it('leaves a dollar sign in inline code alone', () => {
    const html = renderMarkdown('Run `echo $HOME` first.')
    expect(formulas(html)).toBe(0)
    expect(html).toContain('$HOME')
  })

  it('refuses a span that opens or closes on whitespace', () => {
    expect(formulas(renderMarkdown('a $ b^n $ c'))).toBe(0)
  })

  it('refuses one that would run over a line break', () => {
    expect(formulas(renderMarkdown('a $b\nn$ c'))).toBe(0)
  })
})

describe('a formula that cannot be typeset', () => {
  it('prints what the writer wrote, delimiters and all', () => {
    // The failure that matters is the silent one: a hole where an
    // equation should be teaches less than the equation as typed.
    const html = renderMarkdown('Broken: $\\notacommand{x}$ here.')
    expect(formulas(html)).toBe(0)
    expect(html).toContain('$\\notacommand{x}$')
  })

  it('escapes it rather than letting it through as markup', () => {
    expect(typeset('\\notacommand{<img src=x onerror=1>}', false)).toContain('&lt;img')
    expect(typeset('\\notacommand{<img src=x onerror=1>}', false)).not.toContain('<img')
  })

  it('does not take the rest of the lesson with it', () => {
    const html = renderMarkdown('Broken $\\nope{x}$ but $b^n$ still sets.')
    expect(sources(html)).toEqual(['b^n'])
  })
})

describe('what a formula may not carry', () => {
  it('refuses a link out of one, so a citation cannot be forged in TeX', () => {
    const html = renderMarkdown('$\\href{https://evil.example}{click}$')
    // KaTeX is given no trust, so \href never becomes a link: the
    // command is set as the literal text the writer typed. The address
    // survives only in the annotation, where it is source rather than
    // a destination -- inert text in an element nothing renders.
    // `<a[\s>]` and not `<a`, which `<annotation` satisfies.
    expect(html).not.toMatch(/<a[\s>]/)
    expect(drawn(html)).not.toContain('evil.example')
    expect(drawn(html)).toContain('\\href')
  })

  it('keeps its own ink: no colour, no background, no styles of its own', () => {
    const html = renderMarkdown('$\\textcolor{red}{x} \\colorbox{blue}{y}$')
    // The commands are honoured as far as structure and then stripped
    // of their colour by the allowlist, which admits no attribute that
    // can hold one.
    expect(html).not.toContain('mathcolor')
    expect(html).not.toContain('mathbackground')
    // ` style="` and not `style=`: `displaystyle` is a presentational
    // attribute KaTeX sets on its own and has nothing to do with CSS.
    expect(html).not.toContain(' style="')
  })

  it('needs no class, and is given none', () => {
    expect(renderMarkdown('$b^n$')).not.toContain('class=')
  })
})

describe('a note', () => {
  it('may write a logarithm, because it is about one', () => {
    const html = renderMarkdown('so $\\log_b(x)$ inverts it', NOTE_TAGS)
    expect(formulas(html)).toBe(1)
    // And is still a note: no headings, as before.
    expect(renderMarkdown('# Not a lesson', NOTE_TAGS)).not.toContain('<h1')
  })
})

describe('formatting inside a block', () => {
  it('sets the notation in a question rather than printing the dollar signs', () => {
    const html = renderInline('Which quantity is missing in $2^x = 100$?')
    expect(html).toContain('<math')
    expect(html).not.toContain('$')
  })

  it('takes the emphasis a line is written with', () => {
    expect(renderInline('the **base**, not the `exponent`')).toContain('<strong>base</strong>')
    expect(renderInline('the **base**, not the `exponent`')).toContain('<code>exponent</code>')
  })

  it('is one line: no paragraph to break the furniture apart', () => {
    expect(renderInline('a question')).not.toContain('<p>')
  })

  it('refuses what would break the furniture', () => {
    // A heading or a list inside a table cell is a model breaking the
    // shape this app drew, not a model formatting a line.
    expect(renderInline('# Heading')).not.toContain('<h1')
    expect(renderInline('- one\n- two')).not.toContain('<li')
    expect(renderInline('[a link](https://example.com)')).not.toContain('<a')
  })

  it('is sanitised like everything else', () => {
    expect(renderInline('<img src=x onerror=alert(1)>')).not.toContain('<img')
    expect(renderInline('<script>alert(1)</script>')).not.toContain('<script')
  })
})
