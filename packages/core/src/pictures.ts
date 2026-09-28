/**
 * The addresses in `picture` blocks, read and rewritten.
 *
 * A `picture` is pointed at rather than kept, and the address is
 * written from the model's memory. For most of the web that is a coin
 * toss; for Wikimedia, which is where nearly all of these come from, it
 * is worse than that. The file at
 *
 *     .../wikipedia/commons/3/3f/NCDN_-_CDN.svg
 *
 * is not stored under a path anyone can work out: `3/3f` is the first
 * characters of the MD5 of the file's name. A model asked for that URL
 * has to guess two hex digits and the extension on top of the name, and
 * it guesses at least one of them wrong almost every time -- which is
 * how a CDN diagram came to be requested as `NCDN_-_CDN.png` when what
 * exists is `NCDN_-_CDN.svg`, and the lesson printed a sentence about
 * a picture that was never there.
 *
 * None of that needs guessing. Commons will say where a file lives if
 * it is asked by name, and the name is the one part a model reliably
 * knows. So this module pulls the name back out of whatever form of
 * address was written, and the caller asks Commons.
 *
 * Pure: the asking is `apps/web/src/lib/pictures.ts`, because it is a
 * network call and the phone never makes it -- a lesson is resolved
 * once, when it is written, and read everywhere after that.
 */

import { parseBlocks, unglue } from './blocks'

/** The forms of address a picture might be written as. */
const UPLOAD = /^upload\.wikimedia\.org$/i
const WIKI = /(^|\.)(wikipedia|wikimedia)\.org$/i

/**
 * The Commons file name an address names, if it names one.
 *
 * Handles every shape these arrive in:
 *
 *   - `upload.wikimedia.org/wikipedia/commons/3/3f/Name.svg` -- the
 *     hashed path, which is the one the model invents;
 *   - `.../commons/thumb/3/3f/Name.svg/800px-Name.svg.png` -- a
 *     thumbnail, whose real file is the directory it sits in;
 *   - `commons.wikimedia.org/wiki/File:Name.svg`;
 *   - `en.wikipedia.org/wiki/Content_delivery_network#/media/File:Name.svg`
 *     -- the address you get by pressing the picture on an article,
 *     which is what a person would paste.
 *
 * Returns the bare name, without the `File:` prefix, with underscores
 * as Commons writes them.
 */
export function commonsName(raw: string | undefined | null): string | null {
  if (!raw?.trim()) return null

  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (!WIKI.test(url.hostname)) return null

  // `#/media/File:Name` -- the fragment is where the file is named.
  const fragment = decode(url.hash).match(/File:([^/?#]+)$/i)
  if (fragment) return tidy(fragment[1])

  const path = decode(url.pathname)

  const titled = path.match(/\/(?:wiki|File):?\/?(?:File:)([^/?#]+)$/i) ?? path.match(/File:([^/?#]+)$/i)
  if (titled) return tidy(titled[1])

  if (UPLOAD.test(url.hostname)) {
    const parts = path.split('/').filter(Boolean)
    // A thumbnail is `.../thumb/<a>/<ab>/<Name>/<size>-<Name>`, so the
    // file is the second to last part rather than the last.
    const thumb = parts.indexOf('thumb')
    const last = thumb >= 0 ? parts[parts.length - 2] : parts[parts.length - 1]
    if (last && /\.[a-z0-9]{2,5}$/i.test(last)) return tidy(last)
  }

  return null
}

const decode = (s: string) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

const tidy = (name: string) => name.replace(/ /g, '_').trim() || null

/**
 * The same name under every extension it might really have.
 *
 * The name is the part a model gets right and the extension is not: a
 * diagram remembered as a PNG is very often the SVG that PNG was
 * rendered from. The written extension is tried first and then the
 * others, so a correct address costs one request and a wrong one costs
 * a few -- paid once, when the lesson is written.
 */
export const PICTURE_EXTENSIONS = ['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp'] as const

export function nameVariants(name: string): string[] {
  const match = name.match(/^(.*)\.([a-z0-9]{2,5})$/i)
  if (!match) return [name]
  const [, stem, written] = match
  const rest = PICTURE_EXTENSIONS.filter(e => e.toLowerCase() !== written.toLowerCase())
  return [name, ...rest.map(e => `${stem}.${e}`)]
}

/* -------------------------------------------------- reading them out */

export interface PictureBlock {
  /** Which `picture` block this is, counting from the top. */
  index: number
  url?: string
  alt?: string
  caption?: string
  source?: string
  /**
   * What to draw, where nothing that exists will do.
   *
   * A picture with this and no `url` is a commission rather than an
   * address: the writer describes the plate and the web has it drawn
   * once the lesson is finished (`web/lib/drawings`). Until then it has
   * nothing to print and prints nothing. Kept on the block after it is
   * drawn, as the record of what was asked for.
   */
  draw?: string
}

/** Every `picture` block in a lesson body, in the order they appear. */
export function readPictures(markdown: string): PictureBlock[] {
  const out: PictureBlock[] = []
  let index = 0
  for (const part of parseBlocks(markdown)) {
    if (part.kind !== 'block' || part.name !== 'picture') continue
    const data = (part.data ?? {}) as Omit<PictureBlock, 'index'>
    out.push({ index: index++, ...data })
  }
  return out
}

/**
 * What settling one picture comes to: the address it should carry, fields
 * to set on it (a drawing is given its address and its credit together),
 * `null` to take it out, or `undefined` to leave it exactly as written.
 */
export type Settlement = string | null | undefined | Partial<Omit<PictureBlock, 'index'>>

/**
 * Rewrite a lesson's pictures, or take them out.
 *
 * `settle` is handed each block in turn and answers with the address it
 * should carry, or `null` for a picture that could not be found -- and
 * one that could not be found is removed rather than left to fail in
 * front of the reader. The block's own fallback is for a link that dies
 * later, which is a different thing from one that was never alive: a
 * lesson should not ship a sentence about a picture nobody can see.
 *
 * Everything that is not a picture block is returned byte for byte,
 * including the other blocks and the space between them -- rewriting
 * prose to fix a figure is a trade nobody asked for.
 */
export function rewritePictures(
  markdown: string,
  settle: (block: PictureBlock) => Settlement
): { text: string; fixed: number; dropped: number } {
  let index = 0
  let fixed = 0
  let dropped = 0

  // Each picture fence is replaced where it stands, and nothing else is
  // touched. This used to rebuild the body from `parseBlocks`, which
  // drops the whitespace-only gap between two blocks -- so a picture
  // followed straight by a `flow` came back as `\`\`\`\`\`\`flow`,
  // the closing fence glued to the next opening one, and the flow
  // printed as its own JSON.
  const text = unglue(markdown)
    .replace(/^```(\w+)\n([\s\S]*?)\n```$/gm, (whole, name: string, payload: string) => {
      if (name !== 'picture') return whole
      let data: Omit<PictureBlock, 'index'>
      try {
        data = (JSON.parse(payload) ?? {}) as Omit<PictureBlock, 'index'>
      } catch {
        // Not a block `readPictures` counts, so not one to number.
        return whole
      }

      const settled = settle({ index: index++, ...data })
      if (settled === null) {
        dropped += 1
        return ''
      }
      if (settled === undefined) return whole
      const next = typeof settled === 'string' ? { ...data, url: settled } : { ...data, ...settled }
      if (next.url !== data.url) fixed += 1
      return `\`\`\`picture\n${JSON.stringify(next, null, 2)}\n\`\`\``
    })
    // A dropped block leaves the blank lines that were around it.
    .replace(/\n{3,}/g, '\n\n')

  return { text, fixed, dropped }
}

/* --------------------------------------------------------- drawings */

/** A picture that is still a commission: something to draw and nowhere
 *  yet to find it. */
export function isCommission(block: Omit<PictureBlock, 'index'>): boolean {
  return !block.url?.trim() && typeof block.draw === 'string' && block.draw.trim().length > 0
}

/** The commissions in a lesson body, in order. Empty for a lesson whose
 *  pictures are all addresses, which is every lesson written before
 *  drawing existed. */
export function pendingDrawings(markdown: string): PictureBlock[] {
  return readPictures(markdown).filter(isCommission)
}

/* ------------------------------------------------ offered beforehand */

/** Words in a Commons title that keep a file off a lesson's shortlist,
 *  whatever else it matches. Commons holds everything, and a search on
 *  "HTTP status codes" really does answer with a nude portrait of 303. */
const UNFIT = /\b(nude|naked|nudity|porn\w*|sex\w*|erotic\w*|genital\w*|penis|vagina|breasts?|topless)\b/i

/**
 * Which of a Commons search's titles are worth offering a lesson.
 *
 * Pictures only -- a search of the file namespace answers with scanned
 * PDFs and videos too -- nothing a reader would not want printed in a
 * lesson, and each name once, without its `File:` prefix. Order is kept:
 * it is Commons' relevance, and the first few are the ones offered.
 */
export function offeredPictures(titles: string[], most = 15): string[] {
  const picture = new RegExp(`\.(${PICTURE_EXTENSIONS.join('|')})$`, 'i')
  const seen = new Set<string>()
  const out: string[] = []
  for (const title of titles) {
    const name = title.replace(/^File:/i, '').trim()
    const key = name.toLowerCase()
    if (!picture.test(name) || UNFIT.test(name.replace(/[_-]/g, ' ')) || seen.has(key)) continue
    seen.add(key)
    out.push(name)
    if (out.length === most) break
  }
  return out
}
