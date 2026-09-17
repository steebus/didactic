import {
  commonsName,
  nameVariants,
  readPictures,
  rewritePictures,
  type PictureBlock,
} from '@didactic/core/pictures'

/**
 * Settling a lesson's pictures before anybody reads them.
 *
 * A `picture` block is an address written from memory, and the model
 * cannot check one. Until now nothing else did either, so a lesson
 * shipped with whatever it had guessed and the reader met the block's
 * fallback -- a sentence saying what a picture would have shown, which
 * is the worst of both: the lesson has neither the picture nor the
 * paragraph it would have written instead.
 *
 * Nearly all of these are Wikimedia, and a Wikimedia address is the one
 * kind a model cannot possibly get right: the path carries the first
 * characters of the MD5 of the file name. So the name is pulled back
 * out of whatever was written and Commons is asked where the file
 * actually lives. The name is the part a model knows.
 *
 * Anything else is asked for directly, and kept only if something
 * answers.
 *
 * Run once, when the lesson is finished being written. It is not a read
 * path: a reader never waits on this, and neither does the phone.
 */

/** Commons' own API. Read-only, anonymous, no key. */
const COMMONS = 'https://commons.wikimedia.org/w/api.php'

/** Long enough for a slow hop, short enough not to hold up a lesson. */
const TIMEOUT = 6000

/** Politeness, and what Wikimedia asks any automated caller to send. */
const AGENT = 'didactic/1.0 (lesson picture resolution)'

export interface Settled {
  text: string
  /** Pictures whose address was wrong and is now right. */
  fixed: number
  /** Pictures that could not be found at all, and were taken out. */
  dropped: number
}

/**
 * Resolve every picture in a lesson body.
 *
 * Returns the body to store. A picture that cannot be found anywhere is
 * removed: the block's fallback exists for a link that dies later,
 * which is a different thing from one that was never alive.
 */
export async function settlePictures(markdown: string): Promise<Settled> {
  const blocks = readPictures(markdown)
  if (blocks.length === 0) return { text: markdown, fixed: 0, dropped: 0 }

  // Asked for together rather than one after another: a lesson with
  // four pictures should not take four round trips end to end.
  const settled = new Map<number, string | null>()
  await Promise.all(
    blocks.map(async block => {
      settled.set(block.index, await settleOne(block))
    })
  )

  return rewritePictures(markdown, block => settled.get(block.index) ?? null)
}

async function settleOne(block: PictureBlock): Promise<string | null> {
  const name = commonsName(block.url)
  if (name) return await askCommons(name)

  // Not Wikimedia. There is nothing to look up, so the only question is
  // whether it is there.
  return (await reachable(block.url)) ? (block.url ?? null) : null
}

/**
 * Where Commons keeps this file, under any of the extensions it might
 * really have.
 *
 * The names are tried in one request rather than several: the API takes
 * up to fifty titles at a time, and asking once for `Name.png` and
 * `Name.svg` together costs exactly what asking for one does. The
 * written extension wins if both exist, since the model was right about
 * something and we have no better reason to overrule it.
 */
async function askCommons(name: string): Promise<string | null> {
  const tries = nameVariants(name)
  const url = new URL(COMMONS)
  url.searchParams.set('action', 'query')
  url.searchParams.set('titles', tries.map(t => `File:${t}`).join('|'))
  url.searchParams.set('prop', 'imageinfo')
  url.searchParams.set('iiprop', 'url')
  // A file that has been renamed answers under the name it was given.
  url.searchParams.set('redirects', '1')
  url.searchParams.set('format', 'json')
  url.searchParams.set('formatversion', '2')

  const body = await getJson(url.href)
  const pages = (body as { query?: { pages?: unknown[] } })?.query?.pages
  if (!Array.isArray(pages)) return null

  const found = new Map<string, string>()
  for (const page of pages) {
    const row = page as {
      title?: string
      missing?: boolean
      imageinfo?: Array<{ url?: string }>
    }
    const at = row.imageinfo?.[0]?.url
    if (row.missing || !row.title || !at) continue
    found.set(row.title.replace(/^File:/, '').replace(/ /g, '_').toLowerCase(), bare(at))
  }

  for (const attempt of tries) {
    const at = found.get(attempt.toLowerCase())
    if (at) return at
  }
  // A redirect answers under its target rather than under what was
  // asked for, so one answer and one question is still an answer.
  return found.size === 1 ? [...found.values()][0] : null
}

/**
 * The address without the campaign tags Commons hangs off it.
 *
 * `imageinfo` answers with `?utm_source=commons.wikimedia.org&...`
 * appended, which is Wikimedia measuring its own API and no business of
 * a reader's browser. The file is at the same place without them, and
 * this app does not put a tracking parameter in front of anyone.
 */
function bare(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.search = ''
    parsed.hash = ''
    return parsed.href
  } catch {
    return url
  }
}

/** Is anything there? A HEAD, falling back to a ranged GET for the
 *  hosts that refuse one. */
async function reachable(raw: string | undefined): Promise<boolean> {
  if (!raw) return false
  let url: string
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'https:') return false
    url = parsed.href
  } catch {
    return false
  }

  if (await answers(url, 'HEAD')) return true
  return await answers(url, 'GET')
}

async function answers(url: string, method: 'HEAD' | 'GET'): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      headers: {
        'user-agent': AGENT,
        // Enough of the file to know it exists, and no more.
        ...(method === 'GET' ? { range: 'bytes=0-0' } : {}),
      },
      signal: AbortSignal.timeout(TIMEOUT),
    })
    if (!res.ok && res.status !== 206) return false
    // A host that answers an image request with a page has not got the
    // image; it has got a "not found" it decided to dress up.
    const type = res.headers.get('content-type') ?? ''
    return type === '' || type.startsWith('image/')
  } catch {
    return false
  }
}

async function getJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': AGENT, accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    // A picture is worth one request and no retries. Commons being
    // unreachable is not a reason to fail a lesson; it is a reason for
    // that lesson to have one fewer figure.
    return null
  }
}
