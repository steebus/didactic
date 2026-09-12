// First, and deliberately so: pdfjs constructs a `DOMMatrix` at module
// scope and Node has none, so this has to be in place before anything
// below pulls pdfjs in. ESM evaluates imports in order.
import './pdfGlobals'
import { PDFParse } from 'pdf-parse'
import { closeOutline, type OutlineEntry, type PageText } from '@didactic/core/passages'

/** Re-exported so a caller that opens a document has one import for
 *  what to do with what comes out. The arithmetic is in core, where
 *  all three ways of finding an outline can reach it. */
export { closeOutline as close }

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

/**
 * Where pdfjs's worker actually is, as a file URL.
 *
 * Resolved once. `require.resolve` with a literal specifier is visible
 * to a bundler's file tracing and answers with the real path wherever
 * the package sits -- which in this monorepo is the hoisted root rather
 * than beside the app. Null where it cannot be found at all, in which
 * case pdfjs is left to look beside itself as it always did.
 */
let workerSrc: string | null | undefined

async function findWorker(): Promise<string | null> {
  if (workerSrc !== undefined) return workerSrc
  try {
    const { createRequire } = await import('node:module')
    const { pathToFileURL } = await import('node:url')
    const resolve = createRequire(import.meta.url).resolve
    // A file URL rather than a bare path: `import()` of a Windows path
    // is not a specifier anyone should rely on, and this is the one
    // place the difference would be silent.
    workerSrc = pathToFileURL(resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href
  } catch {
    workerSrc = null
  }
  return workerSrc
}

/**
 * A parser that knows where its worker is.
 *
 * `pdf-parse` calls `getDocument` itself and never sets a worker -- the
 * one line that would is commented out in its source -- so on its own it
 * walks into the same failure as the direct pdfjs path. `setWorker` is
 * static and `GlobalWorkerOptions` is a module singleton, so this is
 * done once and both paths are covered.
 */
async function parser(source: DocumentSource): Promise<PDFParse> {
  const found = await findWorker()
  if (found) {
    try {
      PDFParse.setWorker(found)
    } catch {
      // Older shapes of the package, or one that will not be told.
      // pdfjs looks beside itself, exactly as before.
    }
  }
  return new PDFParse(load(source))
}

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
  const doc = await parser(source)
  try {
    const result = await doc.getText(
      range ? { first: range.from, last: range.to } : undefined
    )
    return {
      pages: result.pages.map(p => ({ page: p.num, text: p.text ?? '' })),
      total: result.total,
    }
  } finally {
    await doc.destroy()
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
  const doc = await parser(Buffer.isBuffer(source) ? { buffer: source } : source)
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
    const text = await doc.getText()
    const info = await doc.getInfo()
    if (!text.text?.trim()) throw new Error('extract: no readable content')
    return {
      title: info.info?.Title || 'Untitled PDF',
      text: text.text.trim(),
    }
  } finally {
    await doc.destroy()
  }
}

/**
 * pdfjs, however this build hands it over.
 *
 * `serverExternalPackages` keeps pdfjs out of the bundle, which is what
 * lets it find its own files at runtime -- but an external import does
 * not always come back as a plain namespace. Depending on how the
 * runtime interops the module, what arrives can be the namespace or a
 * wrapper with the real exports on `.default`, and reading
 * `getDocument` off the wrong one gives `undefined` rather than an
 * error. Calling it then throws "is not a function" from somewhere
 * deep, which a `catch` upstream turns into "no structure could be
 * found in it" -- a true sentence about a document that was never
 * opened.
 *
 * So both shapes are accepted, and a third one is refused loudly.
 */
async function loadPdfjs() {
  const mod = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as Record<
    string,
    unknown
  >
  const namespace = (
    typeof mod.getDocument === 'function' ? mod : (mod.default as Record<string, unknown>)
  ) as { getDocument?: unknown } | undefined

  if (!namespace || typeof namespace.getDocument !== 'function') {
    throw new Error(
      'extract: pdfjs loaded but exposed no getDocument — the module interop shape is not one this build expects'
    )
  }

  // Say where the worker is, rather than letting pdfjs guess.
  //
  // pdfjs does its parsing in a worker, and in Node it runs that worker
  // in-process by importing `pdf.worker.mjs` from beside itself. That
  // import is resolved at runtime from a path it builds itself, so a
  // bundler's file tracing never sees the specifier and the file is not
  // put in the function -- which fails as
  //
  //     Setting up fake worker failed: Cannot find module
  //     '/var/task/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'
  //
  // and, because it happens inside `getDocument`, arrives upstream as a
  // document that could not be opened.
  //
  // `require.resolve` with a literal specifier is the opposite: a
  // bundler can see it, and it answers with the real path wherever the
  // package actually sits -- which in this monorepo is the hoisted root
  // rather than beside the app. `next.config.ts` also names the file in
  // `outputFileTracingIncludes`, because being able to resolve a path
  // is no use if the file was never shipped.
  //
  // A file URL rather than a bare path: `import()` of a Windows path is
  // not a specifier anyone should rely on, and this is the one place
  // the difference would be silent.
  const withWorker = namespace as unknown as {
    GlobalWorkerOptions?: { workerSrc?: string }
  }
  if (withWorker.GlobalWorkerOptions) {
    // Not "if it is unset". pdfjs ships with this already set, to the
    // relative `./pdf.worker.mjs` it means to resolve against its own
    // location -- which is the very resolution that fails. A guard on
    // emptiness therefore never fires and changes nothing, which is
    // what the first version of this did.
    const current = withWorker.GlobalWorkerOptions.workerSrc ?? ''
    const settled = current.startsWith('file:') || current.startsWith('/')
    if (!settled) {
      const found = await findWorker()
      if (found) withWorker.GlobalWorkerOptions.workerSrc = found
    }
  }

  return namespace as unknown as typeof import('pdfjs-dist/legacy/build/pdf.mjs')
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
  const pdfjs = await loadPdfjs()

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
        out.push({ title: name, pageFrom: page, children: closeOutline(children, pageCount) })
      }
      return out
    }

    const chapters = closeOutline(await walk(raw as Raw[]), pageCount)
    return { chapters, source: 'bookmarks', pageCount, title }
  } finally {
    await doc.destroy()
  }
}

/** A line of a document, with enough of its typography to tell a
 *  heading from a paragraph. */
export interface TextLine {
  page: number
  text: string
  /** Point size, as the page sets it. */
  size: number
  /** 'serif', 'sans-serif', or whatever the font calls itself. */
  font: string
}

/**
 * The document as lines, each carrying the size it was set in.
 *
 * `getText` flattens all of this away, which is right for the passage
 * cutter and useless for finding headings: on the page a heading is
 * obvious and in the flattened text it is a short line like any other.
 * So this goes to pdfjs directly, where a text item still knows its own
 * transform and font.
 *
 * A line is the items sharing a baseline. The y is rounded before
 * grouping because a run set in two faces -- bold lead-in, roman after
 * -- can sit a fraction apart and would otherwise read as two lines.
 */
export async function readLines(
  source: DocumentSource,
  range?: { from: number; to: number }
): Promise<TextLine[]> {
  const pdfjs = await loadPdfjs()
  const doc = await pdfjs.getDocument({
    ...load(source),
    useWorkerFetch: false,
    isEvalSupported: false,
  }).promise

  try {
    const from = Math.max(1, range?.from ?? 1)
    const to = Math.min(doc.numPages, range?.to ?? doc.numPages)
    const lines: TextLine[] = []

    for (let n = from; n <= to; n++) {
      const page = await doc.getPage(n)
      const content = await page.getTextContent()
      const styles = content.styles as Record<string, { fontFamily?: string }> | undefined

      // Keyed by baseline, and kept in the order the page lays them out
      // rather than sorted: reading order is what an outline is about.
      const byBaseline = new Map<number, { text: string; size: number; font: string }>()

      for (const item of content.items) {
        const run = item as { str?: string; transform?: number[]; fontName?: string; height?: number }
        if (!run.str?.trim() || !run.transform) continue

        const baseline = Math.round(run.transform[5])
        const size = Math.abs(run.transform[0]) || run.height || 0
        const font = styles?.[run.fontName ?? '']?.fontFamily ?? run.fontName ?? ''

        const held = byBaseline.get(baseline)
        if (held) {
          held.text += run.str
          // The largest run on the line decides what the line is: a
          // heading with a small footnote marker in it is a heading.
          if (size > held.size) {
            held.size = size
            held.font = font
          }
        } else {
          byBaseline.set(baseline, { text: run.str, size, font })
        }
      }

      // Down the page: PDF y grows upward, so the largest baseline is
      // the top line.
      const ordered = [...byBaseline.entries()].sort((a, b) => b[0] - a[0])
      for (const [, line] of ordered) {
        const text = line.text.replace(/\s+/g, ' ').trim()
        if (text) lines.push({ page: n, text, size: line.size, font: line.font })
      }

      page.cleanup()
    }

    return lines
  } finally {
    await doc.destroy()
  }
}
