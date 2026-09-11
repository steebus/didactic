/**
 * Build the PDF fixtures the document tests read.
 *
 * Committed as a generator rather than only as the two files it makes,
 * because a binary fixture nobody can regenerate is a fixture nobody
 * can change: the day a test needs a document with six chapters instead
 * of three, the alternative is finding a PDF on the internet and hoping
 * about its contents.
 *
 * Written by hand rather than with a PDF library, because the only
 * library here is the one under test and a fixture built by the code it
 * is meant to be checking proves nothing.
 *
 *     node apps/web/tests/fixtures/make-pdf.mjs
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))

/** Escape a string for a PDF literal. */
const lit = (s) => `(${s.replace(/([\\()])/g, '\\$1')})`

/**
 * Assemble a PDF from a list of object bodies.
 *
 * Objects are numbered from 1 in the order given. The cross-reference
 * table needs each object's byte offset, so the file is built as a
 * buffer and the offsets are measured as it goes -- which is the whole
 * fiddly part of writing one of these by hand.
 */
function assemble(objects, rootRef) {
  let pdf = '%PDF-1.4\n'
  const offsets = [0]

  objects.forEach((body, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })

  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${rootRef} 0 R >>\nstartxref\n${xref}\n%%EOF\n`

  return Buffer.from(pdf, 'latin1')
}

/** A page's content stream: lines of text down the page. */
function contentStream(lines) {
  const body = [
    'BT',
    '/F1 11 Tf',
    '14 TL',
    '54 738 Td',
    ...lines.map((line) => `${lit(line)} Tj T*`),
    'ET',
  ].join('\n')
  return `<< /Length ${body.length} >>\nstream\n${body}\nendstream`
}

/**
 * A document of `pages`, each carrying its own lines, with an optional
 * outline over it.
 *
 * Object layout is fixed so the references below can be written down:
 *   1        catalog
 *   2        page tree
 *   3        font
 *   4..      one content stream and one page object per page
 *   then     the outline root and its items, where there is one
 */
function document({ pages, outline = [] }) {
  const objects = []
  const pageCount = pages.length

  // Reserve 1-3, filled in below.
  objects.push('', '', '')
  objects[2] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'

  const pageRefs = []
  pages.forEach((lines) => {
    objects.push(contentStream(lines))
    const contentRef = objects.length
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
        `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentRef} 0 R >>`
    )
    pageRefs.push(objects.length)
  })

  objects[1] =
    `<< /Type /Pages /Count ${pageCount} /Kids [${pageRefs.map((r) => `${r} 0 R`).join(' ')}] >>`

  if (outline.length === 0) {
    objects[0] = '<< /Type /Catalog /Pages 2 0 R >>'
    return assemble(objects, 1)
  }

  // The outline root, then every item depth-first. Items need to know
  // their own object numbers to link to each other, so they are
  // allocated first and written afterwards.
  objects.push('')
  const outlineRoot = objects.length

  const flat = []
  const allocate = (entries, parent) => {
    const refs = entries.map(() => {
      objects.push('')
      return objects.length
    })
    entries.forEach((entry, i) => {
      flat.push({
        ref: refs[i],
        entry,
        parent,
        prev: refs[i - 1] ?? null,
        next: refs[i + 1] ?? null,
        children: entry.children ? allocate(entry.children, refs[i]) : [],
      })
    })
    return refs
  }
  const top = allocate(outline, outlineRoot)

  for (const { ref, entry, parent, prev, next, children } of flat) {
    const parts = [
      `/Title ${lit(entry.title)}`,
      `/Parent ${parent} 0 R`,
      // An explicit destination: the page object, fitted to the window.
      // This is what getDestination/getPageIndex resolve back to a page.
      `/Dest [${pageRefs[entry.page - 1]} 0 R /Fit]`,
    ]
    if (prev) parts.push(`/Prev ${prev} 0 R`)
    if (next) parts.push(`/Next ${next} 0 R`)
    if (children.length) {
      parts.push(`/First ${children[0]} 0 R`, `/Last ${children[children.length - 1]} 0 R`)
      parts.push(`/Count ${children.length}`)
    }
    objects[ref - 1] = `<< ${parts.join(' ')} >>`
  }

  objects[outlineRoot - 1] =
    `<< /Type /Outlines /First ${top[0]} 0 R /Last ${top[top.length - 1]} 0 R /Count ${top.length} >>`
  objects[0] = `<< /Type /Catalog /Pages 2 0 R /Outlines ${outlineRoot} 0 R >>`

  return assemble(objects, 1)
}

/** Enough words on a page that the cutter has something to cut. */
const prose = (topic, n) =>
  Array.from({ length: n }, (_, i) => `${topic} sentence ${i} about the matter at hand.`)

/* A short handbook with bookmarks: three chapters, one with a section. */
writeFileSync(
  join(HERE, 'handbook.pdf'),
  document({
    pages: [
      ['A Short Handbook', '', 'Contents', 'Openings  1', 'Middles  2', 'Endings  4'],
      ['Openings', ...prose('opening', 26)],
      ['Middles', ...prose('middle', 26)],
      ['Middles, continued', ...prose('middle again', 26)],
      ['Endings', ...prose('ending', 26)],
    ],
    outline: [
      { title: 'Openings', page: 2 },
      { title: 'Middles', page: 3, children: [{ title: 'Middles, continued', page: 4 }] },
      { title: 'Endings', page: 5 },
    ],
  })
)

/* The same shape with no bookmarks at all, so the fallback has
 * something honest to fail over to. */
writeFileSync(
  join(HERE, 'unbookmarked.pdf'),
  document({
    pages: [
      ['Contents', 'One  2', 'Two  3'],
      ['One', ...prose('one', 26)],
      ['Two', ...prose('two', 26)],
    ],
  })
)

console.log('wrote handbook.pdf and unbookmarked.pdf')
