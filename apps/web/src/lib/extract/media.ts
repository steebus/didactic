import type { Media } from '@didactic/core/shared'
import { documentMarkdown } from '../resourceBody'

/**
 * A video or a post, read into words.
 *
 * Neither is a page Readability can do anything with: a YouTube watch
 * page is a megabyte and a half of script with the words in a JSON blob,
 * and an Instagram post is a sign-in wall. Each has a door that does
 * hand the words over, and this goes in by it.
 *
 * - **YouTube**: the player API, asked as the Android app asks it, which
 *   answers with the title, the description and caption tracks that can
 *   be fetched without a browser's proof of being one (the web page's own
 *   tracks come back empty). The transcript is what the concepts are
 *   drawn from; without one, the description is, which on a lecture is
 *   usually a paragraph saying what it covers and on anything else a list
 *   of links. The title comes from oEmbed if the player refuses outright,
 *   so a video is at least named.
 * - **Instagram**: the embed page, which is public where the post page is
 *   not, and carries the caption whole.
 *
 * YouTube does refuse datacenter addresses from time to time ("sign in to
 * confirm you're not a bot"). That costs the transcript and nothing else.
 */

export interface MediaReading {
  title: string
  /** What the concepts are drawn from. */
  text: string
  /** What the reader prints under the player. */
  body: string
}

const TIMEOUT = 15_000

/** The Android app's own client, which the player API answers in full. */
const ANDROID = { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30, hl: 'en' }

export async function readMedia(media: Media, url: string): Promise<MediaReading> {
  return media.kind === 'youtube' ? readYoutube(media.id, url) : readInstagram(media.code)
}

interface CaptionTrack {
  baseUrl: string
  languageCode: string
  kind?: string
}

interface CaptionEvent {
  tStartMs?: number
  dDurationMs?: number
  segs?: Array<{ utf8?: string }>
}

async function readYoutube(id: string, url: string): Promise<MediaReading> {
  let title: string | null = null
  let author: string | null = null
  let description = ''
  let transcript: string[] = []

  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ context: { client: ANDROID }, videoId: id }),
      signal: AbortSignal.timeout(TIMEOUT),
    })
    const player = await res.json()
    title = player.videoDetails?.title ?? null
    author = player.videoDetails?.author ?? null
    description = player.videoDetails?.shortDescription ?? ''

    const tracks: CaptionTrack[] = player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []
    const track = pickTrack(tracks)
    if (track) {
      const captions = await fetch(`${track.baseUrl.replace(/&fmt=[^&]*/, '')}&fmt=json3`, {
        signal: AbortSignal.timeout(TIMEOUT),
      })
      if (captions.ok) {
        const text = await captions.text()
        if (text) transcript = captionParagraphs(JSON.parse(text).events ?? [])
      }
    }
  } catch (e) {
    console.error('media: the player would not answer', e instanceof Error ? e.message : e)
  }

  if (!title) {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(TIMEOUT) }
    )
    if (!res.ok) throw new Error(`media: that video would not open (it answered ${res.status})`)
    const said = await res.json()
    title = said.title as string
    author = said.author_name ?? author
  }

  const parts: Array<{ heading: string | null; content: string }> = []
  // A description is written a line at a time; each line is its own paragraph.
  if (description.trim()) {
    parts.push({ heading: 'Description', content: description.replace(/\n+/g, '\n\n') })
  }
  if (transcript.length) parts.push({ heading: 'Transcript', content: transcript.join('\n\n') })

  const byline = author ? `${title}, a video by ${author}.` : `${title}, a video.`
  return {
    title: title!,
    text: [byline, description, transcript.join('\n\n')].filter(s => s.trim()).join('\n\n'),
    body: parts.length ? documentMarkdown(parts) : '',
  }
}

/** English written by a person first, then English heard by a machine, then anything. */
function pickTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  const english = tracks.filter(t => t.languageCode === 'en' || t.languageCode.startsWith('en-'))
  return english.find(t => t.kind !== 'asr') ?? english[0] ?? tracks[0] ?? null
}

/** Longer than this between two lines, and a new paragraph starts. */
const PAUSE_MS = 2_000
/** Longer than this, a paragraph is broken at the next sentence's end. */
const PARAGRAPH_WORDS = 90

/**
 * Captions as paragraphs.
 *
 * A caption track is a line every few seconds, which set one to a line
 * is a poem nobody wrote. They are run together and broken where the
 * speaker paused, or at the end of a sentence once a paragraph has gone
 * on long enough. A machine's captions have no sentences, so they break
 * on length alone.
 */
export function captionParagraphs(events: CaptionEvent[]): string[] {
  const paragraphs: string[] = []
  let held: string[] = []
  let heldWords = 0
  let lastEnd = 0

  const close = () => {
    const said = held.join(' ').replace(/\s+/g, ' ').trim()
    if (said) paragraphs.push(said)
    held = []
    heldWords = 0
  }

  for (const event of events) {
    const line = (event.segs ?? []).map(s => s.utf8 ?? '').join('').replace(/\s+/g, ' ').trim()
    if (!line || line.startsWith('[') && line.endsWith(']')) continue

    const start = event.tStartMs ?? lastEnd
    if (held.length && start - lastEnd > PAUSE_MS) close()
    held.push(line)
    heldWords += line.split(' ').length
    lastEnd = start + (event.dDurationMs ?? 0)

    if (heldWords >= PARAGRAPH_WORDS && /[.?!]["'”’)]?$/.test(line)) close()
    else if (heldWords >= PARAGRAPH_WORDS * 2) close()
  }
  close()
  return paragraphs
}

async function readInstagram(code: string): Promise<MediaReading> {
  const res = await fetch(`https://www.instagram.com/p/${code}/embed/captioned/`, {
    headers: { 'user-agent': 'didactic/1.0' },
    signal: AbortSignal.timeout(TIMEOUT),
  })
  if (!res.ok) throw new Error(`media: that post would not open (it answered ${res.status})`)
  const { author, caption } = instagramCaption(await res.text())
  if (!caption) throw new Error('media: that post has no caption to read, or is private')

  const opening = caption.split(/\n/)[0].split(/(?<=[.?!])\s/)[0]
  const short = opening.length > 80 ? `${opening.slice(0, 79).trimEnd()}…` : opening
  const title = author ? `${author}: ${short}` : short
  return {
    title,
    text: [author ? `A post by ${author} on Instagram.` : 'A post on Instagram.', caption].join('\n\n'),
    body: documentMarkdown([{ heading: null, content: caption }]),
  }
}

/**
 * The caption on an embed page: the account's name, then the words.
 * The markup is the embed's own, which Instagram has kept stable because
 * other sites print it.
 */
export function instagramCaption(html: string): { author: string | null; caption: string | null } {
  const block = html.match(/<div class="Caption">([\s\S]*?)<div class="CaptionComments">/)?.[1]
  if (!block) return { author: null, caption: null }
  const author = block.match(/class="CaptionUsername"[^>]*>([^<]+)</)?.[1]?.trim() ?? null
  const words = decode(
    block
      .replace(/<a class="CaptionUsername"[\s\S]*?<\/a>/, '')
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .split('\n')
    .map(l => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { author, caption: words || null }
}

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}
