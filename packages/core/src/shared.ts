/**
 * What arrives when something is sent to the inbox from outside the app.
 *
 * A share sheet, a bookmarklet and a share target each hand over some
 * of `url`, `title` and `text`, and none of them agree on which. Android
 * puts the link in `text` far more often than in `url` -- YouTube sends
 * `text: "Some video https://youtu.be/…"` and no url at all -- and a
 * title is sometimes the address again. `sharedLink` reads whatever came
 * and says what was meant: a link with a name, or a note.
 *
 * The link is cleaned before it is kept, because the address is the
 * resource's identity (the route files the same URL twice as one
 * thing): the same video shared on two days arrives with two different
 * `si=` tokens, and the same post with two `igsh=`s.
 *
 * `mediaOf` is what the reader needs to play or show a link rather than
 * read it. Both apps print the same embed from it.
 */

export interface Shared {
  /** The link, cleaned. Null when what was shared is only words. */
  url: string | null
  /** A title worth keeping, or null for the page to name itself. */
  title: string | null
  /** Words that came with it that are not the title or the link. */
  note: string | null
}

export type Media =
  | { kind: 'youtube'; id: string; embed: string }
  | { kind: 'instagram'; code: string; embed: string }

const LINK = /https?:\/\/[^\s<>"')\]]+/i

/** Parameters that say who shared a link or how, never what it is. */
const TRACKING = /^(utm_\w+|fbclid|gclid|mc_cid|mc_eid|igsh|igshid|si|ref_src)$/i

/** Substack's referral and sharing marks, on its own hosts only. */
const SUBSTACK_TRACKING = /^(r|triedRedirect|publication_id|post_id|isFreemail|token|showWelcomeOnShare)$/

function parse(url: string): URL | null {
  try {
    const u = new URL(url.trim())
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null
  } catch {
    return null
  }
}

const bareHost = (u: URL) => u.hostname.toLowerCase().replace(/^(www\.|m\.)/, '')

function youtubeId(u: URL): string | null {
  const host = bareHost(u)
  const ok = (id: string | null | undefined) => (id && /^[\w-]{11}$/.test(id) ? id : null)
  if (host === 'youtu.be') return ok(u.pathname.slice(1).split('/')[0])
  if (host !== 'youtube.com' && host !== 'music.youtube.com' && host !== 'youtube-nocookie.com') return null
  if (u.pathname === '/watch') return ok(u.searchParams.get('v'))
  const [, section, id] = u.pathname.split('/')
  return ['shorts', 'embed', 'live', 'v'].includes(section) ? ok(id) : null
}

function instagramCode(u: URL): string | null {
  if (bareHost(u) !== 'instagram.com') return null
  // `/p/CODE/`, `/reel/CODE/`, `/tv/CODE/`, and the same under a user.
  const found = u.pathname.match(/\/(p|reel|reels|tv)\/([\w-]+)/)
  return found ? found[2] : null
}

/**
 * A link as it should be kept: the same thing always spelled the same.
 *
 * A YouTube link in any of its forms becomes one `watch?v=` address; an
 * Instagram post or reel its `/p/` address; everywhere the marks that
 * only say who shared it are taken off. A link that is not a web address
 * is returned as it came.
 */
export function cleanSharedUrl(url: string): string {
  const u = parse(url)
  if (!u) return url.trim()

  const video = youtubeId(u)
  if (video) return `https://www.youtube.com/watch?v=${video}`

  const post = instagramCode(u)
  if (post) return `https://www.instagram.com/p/${post}/`

  const substack = /(^|\.)substack\.com$/i.test(u.hostname)
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING.test(key) || (substack && SUBSTACK_TRACKING.test(key))) u.searchParams.delete(key)
  }
  u.hash = ''
  return u.toString()
}

/** What a link is to be played or shown as, where it is not a page to read. */
export function mediaOf(url: string | null | undefined): Media | null {
  const u = url ? parse(url) : null
  if (!u) return null
  const id = youtubeId(u)
  if (id) return { kind: 'youtube', id, embed: `https://www.youtube-nocookie.com/embed/${id}` }
  const code = instagramCode(u)
  if (code) return { kind: 'instagram', code, embed: `https://www.instagram.com/p/${code}/embed/captioned/` }
  return null
}

/**
 * What a resource is, as a word, for the figure that names its kind.
 * A link to a video is a video, whatever row it is kept in.
 */
export function kindLabel(kind: string, url?: string | null): string {
  const media = mediaOf(url)
  if (media?.kind === 'youtube') return 'Video'
  if (media?.kind === 'instagram') return 'Post'
  return KIND_LABEL[kind] ?? kind
}

const KIND_LABEL: Record<string, string> = {
  article: 'Article',
  pdf: 'Document',
  book: 'Book',
  note: 'Note',
}

/** Words with the space in them made even, or null for none worth keeping. */
const words = (s: string | null | undefined) => {
  const said = (s ?? '').replace(/\s+/g, ' ').trim()
  return said || null
}

/**
 * Read what a share handed over.
 *
 * The link is the `url` given when there is one, and otherwise the first
 * address in the text, then in the title. The title is kept only when it
 * is words rather than the address again; what is left of the text once
 * the link is taken out of it is the note, unless it only says the
 * title over.
 */
export function sharedLink(input: {
  url?: string | null
  title?: string | null
  text?: string | null
}): Shared {
  const given = input.url && parse(input.url) ? input.url.trim() : null
  const found = given ?? input.text?.match(LINK)?.[0] ?? input.title?.match(LINK)?.[0] ?? null
  const url = found ? cleanSharedUrl(found.replace(/[.,;:!?]+$/, '')) : null

  const strip = (s: string | null | undefined) =>
    words(found ? (s ?? '').split(found).join(' ') : s)?.replace(/[\s\-–—|:]+$/, '') || null

  let title = strip(input.title)
  if (title && LINK.test(title)) title = null
  let note = strip(input.text)
  if (note && title && note.toLowerCase() === title.toLowerCase()) note = null

  // Only words, with nothing to link to: the words are the thing.
  if (!url) return { url: null, title, note: note ?? title }
  // A link with words and no title: short words name it.
  if (!title && note && note.length <= 140 && !/\n/.test(input.text ?? '')) {
    return { url, title: note, note: null }
  }
  return { url, title, note }
}
