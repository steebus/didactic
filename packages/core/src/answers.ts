/**
 * Answering a question inside a lesson.
 *
 * Three question blocks ask something with a right answer -- `check`,
 * `blank` and `sort` -- and all three are graded here rather than in
 * their components, so the phone grades them identically and so the
 * rules are testable without a DOM.
 *
 * A correct answer is worth a small boost to the topic's figure. That
 * reverses an earlier decision not to score these at all, and the
 * reasoning behind that decision still has to be answered rather than
 * dropped: the worry was that scoring makes guessing expensive and
 * turns a teaching device into a test. So:
 *
 *   * Only the first answer to a question counts. The database holds
 *     one row per question and refuses a second (027), so "Ask again"
 *     is for understanding, never for the figure.
 *   * A wrong answer costs nothing. It is recorded -- a question you
 *     got wrong and then understood is the one that taught you
 *     something -- but it subtracts no ability.
 *   * The weight is small by construction: `answered` sits just above
 *     `marked` in DEPTH_WEIGHTS and far below a skim.
 */

/**
 * A stable name for a question, derived from the question itself.
 *
 * Not its position in the body: positions move when a lesson is
 * rewritten, and a key that moves would hand one question's answer to
 * whichever question landed in its place. A hash of the text simply
 * stops matching after a rewrite, which reads as unanswered -- the
 * honest outcome, because the question it recorded is no longer on the
 * page.
 *
 * FNV-1a over the normalised text. It needs to be stable across
 * platforms and cheap, not unguessable: there is nothing to attack
 * here, and the row it keys is the reader's own.
 */
export function questionKey(question: string): string {
  const text = question.replace(/\s+/g, ' ').trim().toLowerCase()
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    // The 32-bit FNV prime, by shifts: a plain multiply overflows into
    // a double and stops being the same number on every platform.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * Compare what was typed with what was expected.
 *
 * Generous on everything that is not the answer: case, surrounding
 * space, the articles people put in without thinking, and the
 * punctuation a phone keyboard adds on its own. Exact on the rest --
 * this is a lesson, and "nearly" is a judgement the reader gets to
 * make when they read why.
 */
export function sameAnswer(typed: string, expected: string): boolean {
  return normaliseAnswer(typed) === normaliseAnswer(expected)
}

function normaliseAnswer(s: string): string {
  return s
    .toLowerCase()
    // Curly quotes and apostrophes come from phone keyboards and from
    // the model's own prose, and a reader cannot see which they typed.
    .replace(/[‘’‚‛']/g, '')
    .replace(/[“”„‟"]/g, '')
    .replace(/[.,;:!?]/g, '')
    .replace(/[‐-―-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(a|an|the) /, '')
}

/** Whether any of the accepted answers matches what was typed. */
export function acceptsAnswer(typed: string, accept: string[]): boolean {
  return accept.some(a => sameAnswer(typed, a))
}

/**
 * Whether a whole question was got right.
 *
 * One rule for all three blocks: everything it asked has to be right.
 * A `sort` with one item in the wrong bucket is not four-fifths
 * correct, it is not correct -- partial credit on a boost this small
 * would be noise, and it would make the page's "Right." harder to
 * trust than the figure it moved.
 */
export function allCorrect(parts: boolean[]): boolean {
  return parts.length > 0 && parts.every(Boolean)
}

/**
 * A fill-in-the-blank sentence, split into the pieces that are printed
 * and the gaps the reader types into.
 *
 * The gaps are numbered rather than positional -- `{{1}}`, `{{2}}` --
 * because the alternative, a bare marker counted left to right, breaks
 * silently when the model writes one more marker than it wrote answers
 * for, and does so by quietly re-pairing every gap after the mistake.
 * A number says which answer a gap belongs to, so a payload that does
 * not add up is caught here rather than teaching the reader that they
 * got a right answer wrong.
 */
export type BlankPiece =
  | { kind: 'text'; text: string }
  | { kind: 'gap'; at: number }

/**
 * Split the sentence. Returns null where the text and the answers do
 * not agree -- an unnumbered gap, a number with no answer behind it, an
 * answer no gap asks for, or no gaps at all -- so the block can print
 * itself as prose rather than as a broken question.
 */
export function parseBlanks(text: string, blanks: number): BlankPiece[] | null {
  if (!text || blanks < 1) return null

  const pieces: BlankPiece[] = []
  const asked = new Set<number>()
  const pattern = /\{\{(\d+)\}\}/g
  let last = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text))) {
    if (match.index > last) {
      pieces.push({ kind: 'text', text: text.slice(last, match.index) })
    }
    // One-based in the payload, because that is how the sentence reads
    // to whoever wrote it; zero-based from here on.
    const at = Number(match[1]) - 1
    if (at < 0 || at >= blanks || asked.has(at)) return null
    asked.add(at)
    pieces.push({ kind: 'gap', at })
    last = match.index + match[0].length
  }

  // Every answer has to be asked for. An answer with no gap is a
  // question the reader cannot possibly get right.
  if (asked.size !== blanks) return null
  if (last < text.length) pieces.push({ kind: 'text', text: text.slice(last) })

  return pieces
}
