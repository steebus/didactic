/**
 * The sections of a lesson, named so they can be linked to.
 *
 * A lesson body is markdown with headings in it, and a lesson is long
 * enough that the headings are worth printing at the top as a contents
 * list. That list has to agree with the body about what each section
 * is: the anchor it links to and the id stamped on the heading are both
 * made here, from the same text in the same order, so a section cannot
 * be listed under one name and stamped with another.
 *
 * The headings are read out of the markdown rather than off the page,
 * through the same block-stripping the renderer does, so the two see
 * the same document. Nothing here touches the DOM, which is what lets
 * the awkward parts -- a heading inside a code fence, two sections of
 * the same name, a heading that is only punctuation -- be written down
 * as tests.
 */

import { parseBlocks } from './blocks'

export interface Section {
  /** The id stamped on the heading, and the anchor that reaches it. */
  id: string
  /** What the heading says. */
  text: string
  /** 1, 2 or 3: how far in the section sits. */
  level: number
}

/** A heading, as read off the rendered lesson. */
export interface Heading {
  level: number
  text: string
}

/**
 * Name a heading.
 *
 * Lowercase words joined by hyphens, which is what every other
 * document on the web does and what a reader pasting a link expects to
 * see. A heading with nothing nameable in it -- an emoji, a bare
 * dash -- still needs an id, so it gets a plain one.
 */
export function slugFor(text: string): string {
  const slug = text
    .normalize('NFKD')
    // Marks left behind by the decomposition above, so "café" and
    // "cafe" name the same section rather than one of them naming
    // nothing.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'section'
}

/**
 * The line under a heading written in the underlined form.
 *
 * Equals signs make an h1. Dashes make an h2 only when there are one or
 * two of them: three or more is how every model writing a lesson draws
 * a rule, and it draws one straight under the last line of a paragraph
 * as often as not. Markdown reads that as the paragraph being an h2,
 * and a whole paragraph once landed in a lesson's contents list that
 * way. `rulesNotHeadings` makes the renderer agree.
 */
const UNDERLINE = /^\s{0,3}(=+|-{1,2})\s*$/

/** Three dashes or more, alone on a line: a rule. */
const RULE = /^\s{0,3}-{3,}\s*$/

/**
 * Markdown with every run of dashes read as a rule, never as the line
 * under a heading.
 *
 * A blank line goes in above any rule that sits straight under text,
 * which is what the writer meant and what `lessonSections` already
 * reads. Fenced code is left as it is. Run over the prose before it is
 * rendered, so the headings on the page are the headings in the list.
 */
export function rulesNotHeadings(markdown: string): string {
  const lines = markdown.split('\n')
  const out: string[] = []
  let fenced = false

  for (const [i, line] of lines.entries()) {
    if (/^\s{0,3}(```|~~~)/.test(line)) fenced = !fenced
    else if (!fenced && RULE.test(line) && lines[i - 1]?.trim()) out.push('')
    out.push(line)
  }

  return out.join('\n')
}

/**
 * The headings of a lesson body, in reading order.
 *
 * Only the three levels worth listing: below an h3 a lesson is naming
 * paragraphs, not sections. Fenced code is skipped, because a `#` at
 * the start of a line in a shell example is a comment and not a
 * section of the lesson.
 */
export function lessonSections(markdown: string): Section[] {
  const headings: Heading[] = []

  // The same split the renderer makes: a block is lifted out before the
  // markdown is parsed, so nothing inside one is a heading here either.
  for (const part of parseBlocks(markdown)) {
    if (part.kind !== 'markdown') continue

    const lines = part.text.split('\n')
    let fenced = false

    for (const [i, line] of lines.entries()) {
      if (/^\s{0,3}(```|~~~)/.test(line)) {
        fenced = !fenced
        continue
      }
      if (fenced) continue

      const atx = /^\s{0,3}(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line)
      if (atx) {
        headings.push({ level: atx[1].length, text: plain(atx[2]) })
        continue
      }

      // The underlined form. Only where there is something above to
      // underline, or a rule between paragraphs would read as one --
      // and never three dashes or more, which is a rule. See
      // `rulesNotHeadings`.
      const underline = UNDERLINE.exec(line)
      if (underline && lines[i - 1]?.trim() && !/^\s{0,3}(#|>|[-*+]\s)/.test(lines[i - 1])) {
        headings.push({
          level: underline[1].startsWith('=') ? 1 : 2,
          text: plain(lines[i - 1]),
        })
      }
    }
  }

  return outlineFrom(headings)
}

/**
 * Every heading in a body, with the line it sits on.
 *
 * `lessonSections` lifts blocks out before it reads, which is right for
 * a contents list and useless to anything that has to write back into
 * the body: the indices it sees belong to the pieces between the
 * blocks, not to the document.
 *
 * So this walks the body once, applying the same grammar -- fences are
 * skipped, three spaces of indent are allowed, trailing hashes come off,
 * `plain` takes the markup out -- and numbers duplicates through the
 * same `outlineFrom`, so the ids it returns are the ids the contents
 * rail shows. It exists so that `foldInto` can find where a section ends
 * without re-deciding what a heading is; a second opinion about that is
 * how a fold once landed inside a ```sh block.
 */
export function headingLines(markdown: string): Array<Section & { line: number }> {
  const found: Array<Heading & { line: number }> = []
  const lines = markdown.split('\n')
  let fenced = false

  for (const [i, line] of lines.entries()) {
    if (/^\s{0,3}(```|~~~)/.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue

    const atx = /^\s{0,3}(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line)
    if (atx) {
      found.push({ level: atx[1].length, text: plain(atx[2]), line: i })
      continue
    }

    const underline = UNDERLINE.exec(line)
    if (underline && lines[i - 1]?.trim() && !/^\s{0,3}(#|>|[-*+]\s)/.test(lines[i - 1])) {
      found.push({
        level: underline[1].startsWith('=') ? 1 : 2,
        text: plain(lines[i - 1]),
        // The heading is the text, not the rule under it.
        line: i - 1,
      })
    }
  }

  const named = outlineFrom(found.map(({ level, text }) => ({ level, text })))
  return named.map((section, i) => ({ ...section, line: found[i].line }))
}

/**
 * A heading as it will read once it is printed.
 *
 * The list says what the heading says, so the marks that made it bold
 * come off: what the reader sees on the page is `The hard part`, and a
 * contents entry reading `The **hard** part` is a bug they can see.
 */
export function plain(markdown: string): string {
  return markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\\([\\`*_[\]#>+-])/g, '$1')
    .trim()
}

/**
 * Name every heading in a lesson, in the order they are read.
 *
 * Two sections called the same thing is ordinary in a lesson -- an
 * "Example" under each of three ideas -- so the second one is numbered
 * rather than left to collide with the first.
 */
export function outlineFrom(headings: Heading[]): Section[] {
  const taken = new Map<string, number>()

  return headings.map(({ level, text }) => {
    const base = slugFor(text)
    const seen = taken.get(base) ?? 0
    taken.set(base, seen + 1)
    return { id: seen === 0 ? base : `${base}-${seen + 1}`, text, level }
  })
}
