/**
 * A lesson, said out loud.
 *
 * The body is markdown written to be read on a sheet: it has headings,
 * emphasis, links, footnote-ish parentheses, and eleven kinds of fenced
 * block that are widgets rather than prose. None of that survives being
 * spoken. `#` is not a word, a link's URL is not a sentence, and a
 * ```check block read aloud is a JSON payload dictated at the reader.
 *
 * So speech is its own reading of the body, not the renderer's reading
 * with the tags taken off. Two decisions carry it:
 *
 * **Blocks are silent.** Every fence goes -- the registered ones
 * (`check`, `sort`, `chart`) because they are things to do and look at,
 * and plain code fences (```css, ```html) because dictated punctuation
 * is not learning. They stay on the sheet, where the reader can do them
 * with their eyes. The audio is the narration, and a lesson that is
 * mostly blocks is mostly silence -- correctly, because there is
 * nothing to say about them that the lesson has not already written.
 *
 * **Chunks are paragraphs, not sentences.** The worker synthesises one
 * chunk at a time and the player starts on the first, so a chunk is the
 * unit of waiting: too small and the voice stops between sentences on a
 * slow machine, too large and the first one takes a minute to arrive.
 * A paragraph is what the writing agent already thinks in, and it ends
 * on a full stop, which is where a voice can stop without sounding cut
 * off. Short paragraphs are joined up to a floor so that a one-line
 * aside is not its own file.
 *
 * Nothing here touches the DOM or the database: it is a string in and
 * strings out, which is what lets the awkward parts -- a heading with
 * no body, a fence that never closes, a paragraph the length of a
 * chapter -- be written down as tests.
 */

import { parseBlocks } from './blocks'

/** A piece of a lesson to be voiced, in reading order. */
export interface SpeechChunk {
  /** Where it falls in the lesson. 0-based, contiguous, gapless. */
  index: number
  /** What the voice says. Plain prose: no markup, no fences. */
  text: string
}

/**
 * How short a chunk may be before it is joined to the next.
 *
 * A heading is a handful of words and a paragraph after it is the thing
 * it names, so on their own a heading would be a two-second audio file
 * and a request of its own. Joined, they are said the way anyone would
 * say them: the name of the section, then the section.
 */
const MIN_CHARS = 220

/**
 * How long a chunk may get before it is split at a sentence.
 *
 * The ceiling exists for the first chunk's sake. At the measured 1.28x
 * on the server, 1200 characters is roughly a minute of audio and about
 * forty-five seconds to make -- the longest anyone should wait before
 * the voice starts. Later chunks could be bigger, since generation runs
 * ahead of playback, but one size is one thing to reason about.
 */
const MAX_CHARS = 1200

/**
 * Drop every fenced region, whatever is in it.
 *
 * Two kinds reach this. Ordinary code -- ```css, ```html -- which the
 * registry never claimed and never will. And a registered block whose
 * payload does not parse: `parseBlocks` hands a malformed one back as
 * markdown rather than losing it, which is right for the sheet, where a
 * reader sees the text and can tell something is wrong with it. Said
 * aloud it is a voice reading `"question":` at somebody. A block that
 * failed to parse has no spoken form either way, so speech takes the
 * other branch and drops it.
 *
 * Line by line rather than by a regex across the whole body, because a
 * lesson about bundlers has a block whose JSON quotes a fence *inside*
 * a string. Matched as a pattern, the region ends at that inner fence
 * and the rest of the payload spills out as prose -- which is exactly
 * how a voice came to be reading JSON aloud. A scanner that toggles on
 * every fence line cannot make that mistake: it takes the opener's own
 * marker and closes only on a line that is a bare marker of at least
 * that length, which is what the CommonMark rule for a fence is.
 *
 * An unclosed fence swallows the rest of the lesson. That is the right
 * failure: the body is malformed, and saying nothing is better than
 * saying whatever the markup happens to leave behind.
 */
function stripFences(markdown: string): string {
  const out: string[] = []
  let fence: string | null = null

  for (const line of markdown.split('\n')) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/)?.[1]

    if (fence === null) {
      // An opener: any fence line, with or without a language.
      if (marker) {
        fence = marker[0].repeat(marker.length)
        continue
      }
      out.push(line)
      continue
    }

    // Inside a fence. Only a bare marker of the same character, at
    // least as long as the opener, closes it -- so ```json inside a
    // payload is content, not the end of the block.
    if (marker && marker[0] === fence[0] && marker.length >= fence.length && !line.slice(line.indexOf(marker) + marker.length).trim()) {
      fence = null
    }
  }

  return out.join('\n')
}

/**
 * Markdown to what a person would say.
 *
 * Inline syntax is unwrapped rather than deleted, because the words
 * inside it are the sentence: `**street name**` is spoken "street
 * name", and a link is spoken as its text, never its URL. What is
 * deleted is only what has no spoken form at all -- image syntax, the
 * hashes of a heading, the bullet of a list item.
 */
export function speakable(markdown: string): string {
  let text = markdown

  // Images first: they are links with a bang, and unwrapping links
  // first would leave the alt text stranded as a sentence.
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  // A link says its text. The URL is unspeakable and never useful.
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  // Inline code is usually an identifier -- `body_finished` -- and the
  // backticks are not said. The word inside is the point.
  text = text.replace(/`([^`]+)`/g, '$1')
  // Emphasis, in either marker, at either weight.
  text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1')
  text = text.replace(/\*([^*]+)\*/g, '$1')
  text = text.replace(/__([^_]+)__/g, '$1')
  // Single underscores only when they wrap a word, so snake_case
  // identifiers survive as themselves.
  text = text.replace(/(^|\s)_([^_]+)_(?=\s|$)/g, '$1$2')
  // Strikethrough: said, because it is still in the sentence.
  text = text.replace(/~~([^~]+)~~/g, '$1')
  // A heading is said as its words. The hashes are not words.
  text = text.replace(/^#{1,6}\s+/gm, '')
  // Bullets and numbers: the marker is punctuation the voice supplies
  // by pausing, and "hyphen" said aloud is noise.
  text = text.replace(/^\s*[-*+]\s+/gm, '')
  text = text.replace(/^\s*\d+\.\s+/gm, '')
  // Blockquote markers.
  text = text.replace(/^\s*>\s?/gm, '')
  // A horizontal rule is a pause, not a word.
  text = text.replace(/^\s*(?:[-*_]\s*){3,}$/gm, '')
  // Tables are not prose and cannot be said in order; a row read left
  // to right is a list of cells with no sentence in it.
  text = text.replace(/^\s*\|.*\|\s*$/gm, '')

  // Collapse the holes all of that leaves, without joining paragraphs:
  // the blank line between them is the boundary chunks are cut on.
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .trim()
}

/**
 * The lesson as a sequence of things to say.
 *
 * Empty where a lesson is nothing but blocks, which is a real state and
 * not an error: the caller decides what to do about a lesson with
 * nothing to hear.
 */
export function speechChunks(markdown: string): SpeechChunk[] {
  // The renderer's own split, so a registered block is lifted out whole
  // and nothing inside one is mistaken for prose.
  const prose = parseBlocks(markdown)
    .filter(part => part.kind === 'markdown')
    .map(part => part.text)
    .join('\n\n')
  // Whatever fences are left: code the registry does not own, and
  // blocks whose payload was too broken for it to claim. A dictated
  // stylesheet is the one thing worse than no audio at all.
  const spoken = stripFences(prose)

  const paragraphs = speakable(spoken)
    .split(/\n\s*\n/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(p => hasSpeech(p))

  const sized = paragraphs.flatMap(split)

  // Join what is too short to be worth a file of its own, so a heading
  // rides with the paragraph it names.
  const joined: string[] = []
  for (const piece of sized) {
    const last = joined[joined.length - 1]
    if (last !== undefined && last.length < MIN_CHARS && last.length + piece.length <= MAX_CHARS) {
      joined[joined.length - 1] = `${last} ${piece}`
    } else {
      joined.push(piece)
    }
  }

  return joined.map((text, index) => ({ index, text }))
}

/**
 * Is there anything in here a voice could say?
 *
 * Stripping markup can leave a line that is punctuation and nothing
 * else -- a rule that was three dashes, a table row that was all
 * pipes. Synthesising it costs a model call to produce silence.
 */
function hasSpeech(text: string): boolean {
  return /[a-z0-9]/i.test(text)
}

/**
 * Cut a long paragraph at sentence ends.
 *
 * Only ever at a boundary the voice would pause on anyway. A paragraph
 * with no sentence end in it -- a very long list item, a URL someone
 * pasted -- is left whole rather than cut mid-word: one slow chunk is
 * better than a sentence that stops in the middle of itself.
 */
function split(paragraph: string): string[] {
  if (paragraph.length <= MAX_CHARS) return [paragraph]

  // Keep the terminator with the sentence it ends.
  const sentences = paragraph.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g)
  if (!sentences) return [paragraph]

  const out: string[] = []
  let current = ''
  for (const sentence of sentences) {
    const piece = sentence.trim()
    if (!piece) continue
    if (current && current.length + piece.length + 1 > MAX_CHARS) {
      out.push(current)
      current = piece
    } else {
      current = current ? `${current} ${piece}` : piece
    }
  }
  if (current) out.push(current)
  return out
}

/**
 * Roughly how long this will take to say.
 *
 * 150 words a minute is ordinary narration and close enough for what it
 * is used for: telling the reader what they are waiting for. Never
 * presented as exact, and never used to decide anything -- the real
 * duration is whatever the audio turns out to be.
 */
export function spokenMinutes(chunks: SpeechChunk[]): number {
  const words = chunks.reduce((n, c) => n + c.text.split(/\s+/).filter(Boolean).length, 0)
  return words / 150
}
