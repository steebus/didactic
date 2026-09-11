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

import { marked } from 'marked'
import createDOMPurify from 'dompurify'

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

/**
 * Parse markdown and sanitise the result.
 *
 * Links out are opened beside what is being read rather than in place
 * of it, which is the one attribute worth adding after the fact.
 */
export function renderMarkdown(markdown: string, allowed: string[] = PROSE_TAGS): string {
  const DOMPurify = purifier()

  const raw = marked.parse(markdown, { async: false, gfm: true, breaks: false })
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
