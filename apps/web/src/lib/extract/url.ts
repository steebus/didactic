import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import { NOTE_ATTR } from './markdown'

export function extractFromHtml(html: string, url: string) {
  const dom = new JSDOM(html, { url })
  keepNotes(dom.window.document)
  const parsed = new Readability(dom.window.document).parse()
  if (!parsed?.textContent?.trim()) {
    throw new Error('extract: no readable content')
  }
  return {
    title: parsed.title || url,
    text: parsed.textContent.trim(),
    /** The article as Readability left it: the page with its furniture
     *  taken away. What the reader is made from (`./markdown`). */
    html: parsed.content ?? '',
  }
}

export async function fetchAndExtract(url: string) {
  const res = await fetch(url, { headers: { 'user-agent': 'didactic/1.0' } })
  if (!res.ok) throw new Error(`extract: fetch failed ${res.status}`)
  return extractFromHtml(await res.text(), url)
}

/** Longer than this, a handler's string is a script, not a note. */
const NOTE_MAX = 2000

/**
 * A page's pop-up notes, made into something the article keeps.
 *
 * Older pages gloss a word with a link that goes nowhere and a handler
 * that opens a box with the note in it -- `<a href="javascript:void(0)"
 * onclick="return overlib('Do not seek yourself outside yourself.')">`.
 * Readability reduces a `javascript:` link to its words, and the note
 * went with it: an annotated essay came in with every annotation gone.
 * So each such link is swapped, before Readability reads the page, for
 * a span carrying its note, which the importer sets as a numbered note
 * at the foot (`./markdown`). Nothing on the page is run to find it:
 * the note is the first string the handler is called with.
 */
function keepNotes(document: Document) {
  for (const link of Array.from(document.querySelectorAll('a[href]'))) {
    const href = link.getAttribute('href')?.trim() ?? ''
    if (!/^(javascript:|#$)/i.test(href)) continue
    const note =
      noteIn(document, link.getAttribute('onclick')) ??
      noteIn(document, link.getAttribute('onmouseover'))
    if (!note) continue
    const span = document.createElement('span')
    span.setAttribute(NOTE_ATTR, note)
    span.append(...Array.from(link.childNodes))
    link.replaceWith(span)
  }
}

/** The first string a handler is called with, as the words it shows. */
function noteIn(document: Document, handler: string | null): string | null {
  const quoted = handler && /\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/.exec(handler)
  if (!quoted) return null
  const raw = quoted[2].replace(/\\(.)/g, '$1')
  if (raw.length > NOTE_MAX) return null
  // A note may carry markup of its own; a template's content is inert,
  // so reading its words loads and runs nothing.
  const holder = document.createElement('template')
  holder.innerHTML = raw
  const text = (holder.content.textContent ?? '').replace(/\s+/g, ' ').trim()
  return text.length > 1 ? text : null
}
