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
      // underline, or a rule between paragraphs would read as one.
      const underline = /^\s{0,3}(=+|-+)\s*$/.exec(line)
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
