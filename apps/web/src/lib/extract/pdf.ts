import { PDFParse } from 'pdf-parse'
import type { OutlineEntry, PageText } from '@didactic/core/passages'

/**
 * Opening a PDF.
 *
 * Two libraries, deliberately. `pdf-parse` reconstructs lines and
 * paragraphs out of positioned text runs, which is the part that is
 * genuinely hard and the part the passage cutter depends on -- a page
 * returned as one unbroken run cuts badly. What it does not expose is
 * the document object underneath, so the outline it hands over carries
 * bookmark titles with unresolved destinations: the chapter names, but
 * not the pages they point at.
 *
 * `pdfjs-dist` is what `pdf-parse` is built on and is already installed
 * beside it. Naming it directly costs nothing -- it is the same copy,
 * pinned to the same version -- and it can resolve a destination to a
 * page index, which is what turns a bookmark list into an outline the
 * bed can actually be laid out from.
 *
 * The alternative was matching chapter titles against page text and
 * guessing. That guesses wrong on exactly the documents that matter:
 * every title appears on the contents page, so every chapter would
 * resolve to page one.
 */

/** How many pages of the front are read looking for a contents page. */
export const FRONT_PAGES = 15

/**
 * Where the bytes come from.
 *
 * A URL is preferred for anything read in rounds. pdfjs range-fetches
 * when it is given one, so a round that wants pages 200-240 of a fifty
 * megabyte book pulls the cross-reference table and those pages rather
 * than the book -- and the alternative is downloading the whole thing
 * again on every one of a dozen rounds. Where the host will not serve
 * ranges pdfjs fetches the lot, which is exactly what passing a buffer
 * would have done, so this is never worse.
 */
export type DocumentSource = { buffer: Buffer } | { url: string }

const load = (source: DocumentSource) =>
  'url' in source
    ? { url: source.url }
    : { data: new Uint8Array(source.buffer) }

export interface DocumentText {
  pages: PageText[]
  /** Pages in the whole document, not in this range. */
  total: number
}

/**
 * The text of a range of pages, one entry per page.
 *
 * `from` and `to` are one-based and inclusive, matching how a reader
 * counts and how a citation prints. Omitting them reads everything,
 * which is right for a syllabus and wrong for a book -- see the rounds
 * in `lib/document.ts`.
 */
export async function readPages(
  source: DocumentSource,
  range?: { from: number; to: number }
): Promise<DocumentText> {
  const parser = new PDFParse(load(source))
  try {
    const result = await parser.getText(
      range ? { first: range.from, last: range.to } : undefined
    )
    return {
      pages: result.pages.map(p => ({ page: p.num, text: p.text ?? '' })),
      total: result.total,
    }
  } finally {
    await parser.destroy()
  }
}

/**
 * The whole document as one string, with its title.
 *
 * What the concept extractor has always been given. Kept exactly as it
 * was, because filing a PDF into the graph is a different job from
 * sowing a bed out of one and did not stop working.
 */
export async function extractFromPdf(source: DocumentSource | Buffer) {
  const parser = new PDFParse(load(Buffer.isBuffer(source) ? { buffer: source } : source))
  try {
    // One after the other, not together.
    //
    // These two ran in a `Promise.all` from the day this file was
    // written, and every PDF ingested since has failed on it with a
    // `DataCloneError` out of pdfjs: the first call hands ownership of
    // the backing array to the worker, and the second finds it
    // detached and cannot transfer it. Nothing caught it because
    // nothing tested this function against an actual PDF -- the
    // extractor's only fixture was an HTML article.
    //
    // There is nothing to win here anyway. Both calls queue against the
    // same single worker, so running them together never made them
    // concurrent; it only made them broken.
    const text = await parser.getText()
    const info = await parser.getInfo()
    if (!text.text?.trim()) throw new Error('extract: no readable content')
    return {
      title: info.info?.Title || 'Untitled PDF',
      text: text.text.trim(),
    }
  } finally {
    await parser.destroy()
  }
}

/** What the document says about itself. */
export interface DocumentOutline {
  chapters: OutlineEntry[]
  /** 'bookmarks' when the document carried its own, 'none' otherwise.
   *  The model-read case is set by the caller, not here. */
  source: 'bookmarks' | 'none'
  pageCount: number
  title: string | null
}

/**
 * The document's own outline, with every entry resolved to a page.
 *
 * Most books, handbooks and syllabuses carry one, and where they do it
 * is exact and free -- no model call, no guessing, and the page numbers
 * are the author's own. Where they do not, this says so plainly and the
 * caller falls back to reading the contents pages.
 *
 * A bookmark whose destination cannot be resolved is dropped rather
 * than guessed at. A chapter at the wrong page is worse than a chapter
 * missing: the first sends every citation in it somewhere wrong.
 */
export async function readOutline(source: DocumentSource): Promise<DocumentOutline> {
  // Imported here rather than at the top of the file: this is the only
  // function that needs it, it is a large module, and the ingestion
  // path that never asks for an outline should not pay to load it.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

  const doc = await pdfjs.getDocument({
    ...load(source),
    useWorkerFetch: false,
    isEvalSupported: false,
  }).promise

  try {
    const pageCount = doc.numPages
    const metadata = await doc.getMetadata().catch(() => null)
    const title =
      (metadata?.info as { Title?: string } | undefined)?.Title?.trim() || null

    const raw = await doc.getOutline().catch(() => null)
    if (!raw?.length) return { chapters: [], source: 'none', pageCount, title }

    /** Where one bookmark points, one-based, or null if it will not say. */
    const pageOf = async (dest: unknown): Promise<number | null> => {
      try {
        const resolved = typeof dest === 'string' ? await doc.getDestination(dest) : dest
        if (!Array.isArray(resolved) || resolved.length === 0) return null
        return (await doc.getPageIndex(resolved[0])) + 1
      } catch {
        return null
      }
    }

    type Raw = { title?: string; dest?: unknown; items?: Raw[] }

    /** Titles and start pages, depth first, before any end page is known. */
    const walk = async (
      items: Raw[]
    ): Promise<Array<{ title: string; pageFrom: number; children: OutlineEntry[] }>> => {
      const out: Array<{ title: string; pageFrom: number; children: OutlineEntry[] }> = []
      for (const item of items) {
        const page = await pageOf(item.dest)
        const name = item.title?.trim()
        if (page === null || !name) continue
        const children = await walk(item.items ?? [])
        out.push({ title: name, pageFrom: page, children: close(children, page, pageCount) })
      }
      return out
    }

    const chapters = close(await walk(raw as Raw[]), 1, pageCount)
    return { chapters, source: 'bookmarks', pageCount, title }
  } finally {
    await doc.destroy()
  }
}

/**
 * Give every entry an end page.
 *
 * A bookmark says where a chapter starts and nothing about where it
 * stops, so a chapter runs until the next one begins. The last runs to
 * the end of whatever contains it -- the document, or the parent
 * chapter for a section.
 *
 * Exported so the same closing can be applied to an outline the model
 * read off a contents page, which arrives in exactly the same shape and
 * with exactly the same gap in it.
 */
export function close<T extends { title: string; pageFrom: number; children?: OutlineEntry[] }>(
  entries: T[],
  _from: number,
  endsAt: number
): OutlineEntry[] {
  const sorted = [...entries].sort((a, b) => a.pageFrom - b.pageFrom)

  return sorted.map((entry, i) => {
    const next = sorted[i + 1]
    // One before the next sibling starts, or the end of the parent.
    // Never before its own start, which a document with two bookmarks
    // on one page would otherwise produce.
    const pageTo = next ? Math.max(entry.pageFrom, next.pageFrom - 1) : endsAt
    return {
      title: entry.title,
      pageFrom: entry.pageFrom,
      pageTo,
      ...(entry.children?.length ? { children: entry.children } : {}),
    }
  })
}
