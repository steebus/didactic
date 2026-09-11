/**
 * Markdown into HTML, sanitised.
 *
 * Two kinds of text go through here and neither is trusted. A lesson
 * body is model output, and a model can be steered by an ingested page
 * into emitting markup. A note is the reader's own writing, which is
 * not hostile but arrives from a contenteditable box that will happily
 * paste half a web page into itself.
 *
 * So there is one pipeline and two allowlists: everything a lesson is
 * allowed to be, and the much shorter list a note is allowed to be.
 */

import { Marked, type Tokens } from 'marked'
import createDOMPurify from 'dompurify'
import { LESSON_SCHEME, resolveLesson, type LessonLink } from '@didactic/core/lessonLinks'
import {
  SOURCE_SCHEME,
  resolveSource,
  CITATION_STUB,
  type SourceLink,
} from '@didactic/core/sourceLinks'

/**
 * DOMPurify needs a DOM, and a client component is still rendered once
 * on the server to produce the initial HTML. Returning nothing from
 * that pass leaves the prose blank until hydration and makes the two
 * renders disagree, which React reports as a hydration mismatch.
 *
 * jsdom is already a dependency -- the ingester parses fetched pages
 * with it -- so the server pass gets a window of its own and sanitises
 * exactly as the browser does.
 */
export function purifier() {
  if (typeof window !== 'undefined') return createDOMPurify(window)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { JSDOM } = require('jsdom') as typeof import('jsdom')
  return createDOMPurify(new JSDOM('').window as unknown as Window & typeof globalThis)
}

/** Everything a lesson body is allowed to be. */
export const PROSE_TAGS = [
  'p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'hr', 'a',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
]

/**
 * What a note is allowed to be: emphasis, lists, links, code. No
 * headings and no tables -- a note is a remark about a passage, and a
 * remark that needs an <h2> is a lesson.
 */
export const NOTE_TAGS = ['p', 'br', 'strong', 'em', 'del', 'code', 'ul', 'ol', 'li', 'a']

/** What a link to a lesson that is not there says on hover. */
export const STUB_NOTE = 'No lesson for this yet'

/** An attribute value this module writes itself, made safe to print. */
function attr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * A reader that knows what `lesson:` and `source:` mean.
 *
 * Resolving the scheme here rather than in the markdown is what keeps
 * a name inside a code fence a name: marked has already decided what
 * is prose and what is a specimen by the time a link token exists, so
 * `[x](lesson:y)` in a shell example is printed, not followed. Every
 * other kind of link falls through to marked's own renderer.
 *
 * A name nothing answers to is still printed, and still says what the
 * sentence needed it to say -- it is only marked as ground not broken
 * yet. `data-stub` carries that to the stylesheet, and the title
 * carries it to anyone who cannot see the colour.
 */
function reader(lessons?: Map<string, LessonLink>, sources?: Map<string, SourceLink>) {
  return new Marked({
    renderer: {
      link(token: Tokens.Link) {
        const href = token.href ?? ''

        // A citation of one of the reader's own documents.
        //
        // The page rides in the href's fragment rather than in an
        // attribute of its own, so that what the model writes is a
        // whole address and what comes out is an ordinary link: it can
        // be followed, middle-clicked and copied, and `resolveSource`
        // has one string to turn into one URL. (An attribute would in
        // fact survive the sanitiser -- DOMPurify passes `data-*`
        // through by default -- so this is a choice about what a
        // citation should be, not a way round a restriction.)
        const cited = SOURCE_SCHEME.exec(href)
        if (cited) {
          const text = this.parser.parseInline(token.tokens)
          const page = cited[2] ? Number(cited[2]) : null
          const found = sources ? resolveSource(sources, cited[1], page) : null

          return found
            ? `<a href="${attr(found.href)}" title="${attr(found.label)}" data-cite>${text}</a>`
            : `<a data-stub title="${attr(CITATION_STUB)}">${text}</a>`
        }

        const slug = LESSON_SCHEME.exec(href)?.[1]
        if (!slug) return false

        const text = this.parser.parseInline(token.tokens)
        const found = lessons ? resolveLesson(lessons, slug) : null

        return found
          ? `<a href="${attr(found.href)}" title="${attr(found.label)}">${text}</a>`
          : `<a data-stub title="${attr(STUB_NOTE)}">${text}</a>`
      },
    },
  })
}

/**
 * Parse markdown and sanitise the result.
 *
 * Links out are opened beside what is being read rather than in place
 * of it, which is the one attribute worth adding after the fact.
 *
 * `lessons` is what the lesson being read can reach. Without it a
 * `lesson:` name has nothing to resolve against and prints as a stub,
 * which is the right answer for a note: a note is a remark about a
 * passage and has no map around it.
 */
export function renderMarkdown(
  markdown: string,
  allowed: string[] = PROSE_TAGS,
  lessons?: Map<string, LessonLink>,
  sources?: Map<string, SourceLink>
): string {
  const DOMPurify = purifier()

  const raw = reader(lessons, sources).parse(markdown, { async: false, gfm: true, breaks: false })
  DOMPurify.addHook('afterSanitizeAttributes', node => {
    if (node.tagName === 'A' && node.getAttribute('href')?.startsWith('http')) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noreferrer')
    }
  })

  const clean = DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: allowed,
    ALLOWED_ATTR: ['href', 'title'],
    // Links in generated prose open elsewhere; nothing here should be
    // able to script or reach back into the page.
    ADD_ATTR: ['target', 'rel'],
  })

  // Hooks are global to DOMPurify, so this one is removed rather than
  // stacking a new copy on every render.
  DOMPurify.removeHook('afterSanitizeAttributes')

  return clean
}
