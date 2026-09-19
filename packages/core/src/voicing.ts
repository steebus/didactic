/**
 * Where a lesson stands as a recording, said as one word.
 *
 * The topic sheet prints a route of up to sixteen lessons with a small
 * circle against each, and that circle is asked to do three jobs at
 * once: offer to make the recording, play it once it is made, and in
 * between say how far through the making it is. Those are the same
 * question at three moments -- *can I hear this yet* -- so they are one
 * control, and what it is offering at any moment is decided here rather
 * than in the sheet that draws it.
 *
 * Here rather than in the web app because the phone prints the same
 * route and will want the same circle, and a rule for "does the audio
 * exist" written twice is two rules that agree until the day one of
 * them learns about a new state. The server's five states are the raw
 * material; what a reader can actually *do* is the derived thing, and
 * it is the derived thing both front ends need.
 *
 * Nothing here knows about audio elements, storage or React: it is a
 * standing in and a word out.
 */

/** What the server says became of a voicing. `none` means nobody has
 *  asked for this lesson to be read aloud. */
export type VoicingState = 'none' | 'queued' | 'voicing' | 'ready' | 'failed'

/** Where one lesson stands as a recording, in a list of them. The shape
 *  `/api/lessons/audio` answers with, per lesson. */
export interface VoicingStanding {
  state: VoicingState
  /** Pieces made so far. */
  done: number
  /** Pieces there will be. Null until the worker has read the body and
   *  decided, which is the first thing it does. */
  total: number | null
}

/**
 * What the control is offering, right now.
 *
 *   make     nothing exists; pressing asks for it
 *   waiting  asked for, and nothing said yet
 *   making   underway, with pieces already made -- which can be played
 *   play     the whole recording exists
 *   pause    this is the lesson playing at the moment
 *   again    the last attempt failed; pressing asks again
 *
 * `making` is the one worth having separately from `play`. Generation
 * outruns playback by design, so a lesson three pieces in is a lesson
 * the reader can start listening to now -- treating it as "not ready"
 * is a dead press on a control that is visibly doing something, which
 * is the worst kind.
 */
export type ListenOffer = 'make' | 'waiting' | 'making' | 'play' | 'pause' | 'again'

/** Nothing asked for, as a standing. What a lesson with no row reads
 *  as, so a caller never has to handle the absence itself. */
export const NOT_VOICED: VoicingStanding = { state: 'none', done: 0, total: null }

/**
 * Whether there is anything to play.
 *
 * True the moment the first piece exists, not when the last one does.
 * A lesson still being made is a lesson that can be listened to -- the
 * player is fed a piece at a time and the rest arrive behind it -- so
 * the question is whether any audio exists, not whether all of it does.
 *
 * `ready` is trusted on its own account: a list read taken while the
 * final piece was being counted can say ready with a `done` of zero,
 * and refusing to play a finished recording over an arithmetic race is
 * the wrong way round.
 */
export function canPlay(standing: VoicingStanding | undefined): boolean {
  if (!standing) return false
  return standing.state === 'ready' || standing.done > 0
}

/**
 * What the control against a lesson is offering.
 *
 * `playing` is whether this lesson is the one the player has loaded and
 * running, which no standing can know: it is a fact about the bar at
 * the foot of the sheet, not about the recording.
 */
export function listenOffer(
  standing: VoicingStanding | undefined,
  playing = false
): ListenOffer {
  if (playing) return 'pause'
  const here = standing ?? NOT_VOICED
  switch (here.state) {
    case 'ready':
      return 'play'
    case 'failed':
      return 'again'
    case 'queued':
    case 'voicing':
      // Underway. Whether it can be pressed is whether anything has
      // been said yet, which `done` is the whole of.
      return here.done > 0 ? 'making' : 'waiting'
    default:
      return 'make'
  }
}

/**
 * How much of the recording exists, as a factor of the whole.
 *
 * Null where it cannot honestly be said -- a lesson queued before the
 * worker has counted its pieces knows neither how many there are nor
 * how many are made, and a ring drawn from a guess would be a ring that
 * jumps backwards when the real figure lands.
 *
 * A finished recording is 1 whatever the counts say, for the reason
 * `canPlay` trusts `ready`: the state is the stronger claim.
 */
export function voicingProgress(standing: VoicingStanding | undefined): number | null {
  if (!standing) return null
  if (standing.state === 'ready') return 1
  if (standing.state === 'none' || standing.state === 'failed') return null
  if (!standing.total) return null
  // Clamped: the count of made pieces comes from one query and the
  // total from another, and a ring drawn past full reads as a fault.
  return Math.min(1, Math.max(0, standing.done / standing.total))
}

/**
 * What the control says, for a screen reader and for the tooltip.
 *
 * The title is in it because a route is sixteen identical circles, and
 * "Play" sixteen times over is a list nobody can navigate by ear.
 */
export function listenLabel(
  offer: ListenOffer,
  title: string,
  standing: VoicingStanding | undefined
): string {
  const here = standing ?? NOT_VOICED
  // How far through, where the figure is worth saying. A reader who
  // cannot see the ring gets the same fact the ring carries.
  const far = here.total ? `, ${here.done} of ${here.total} pieces` : ''

  switch (offer) {
    case 'pause':
      return `Pause ${title}`
    case 'play':
      return `Listen to ${title}`
    case 'making':
      return `Listen to ${title} — still being read aloud${far}`
    case 'waiting':
      return `${title} is waiting to be read aloud`
    case 'again':
      return `Reading ${title} aloud failed — try again`
    default:
      return `Read ${title} aloud`
  }
}

/** The short word under the circle's breath, for a tooltip on a sheet
 *  that has room for one. The same five facts, without the title. */
export const LISTEN_NOTE: Record<ListenOffer, string> = {
  make: 'No recording yet — press to have it read aloud',
  waiting: 'Waiting to be read aloud',
  making: 'Being read aloud — press to start listening',
  play: 'Recorded, and ready to listen to',
  pause: 'Playing now',
  again: 'The reading failed — press to try again',
}

/* ---------------------------------------------------------------- */
/* Position in a recording                                           */
/* ---------------------------------------------------------------- */

/**
 * A piece of a recording, as far as *position* is concerned.
 *
 * Deliberately only the length. The player's chunks carry a path, a
 * signed URL and the words that were said, and none of that has any
 * bearing on where a given second falls -- so the seeking maths takes
 * the one field it actually reads, and can be tested with a list of
 * numbers.
 */
export interface SpokenSpan {
  /** How long this piece plays, in seconds. */
  seconds: number
}

/** Where a position in the whole lesson falls among its pieces. */
export interface SpokenPlace {
  /** Which piece is playing at that moment. */
  index: number
  /** How far into that piece, in seconds. */
  offset: number
}

/**
 * How long the whole recording runs.
 *
 * Only honest once every piece exists: while a lesson is still being
 * made this is the length of what has been made so far, which is why
 * the bar draws nothing until the recording is whole.
 */
export function spokenLength(pieces: SpokenSpan[]): number {
  return pieces.reduce((n, p) => n + Math.max(0, p.seconds), 0)
}

/** How much of the lesson comes before a given piece. */
export function secondsBefore(pieces: SpokenSpan[], index: number): number {
  return spokenLength(pieces.slice(0, Math.max(0, index)))
}

/**
 * Which piece holds a given second of the lesson, and where in it.
 *
 * The reader drags a bar that represents one recording; the recording
 * is a dozen files. This is the whole of the translation between the
 * two, and it is here rather than in the player because the phone's
 * player is a different player over the same pieces.
 *
 * Both ends are clamped, and the last piece takes everything past the
 * end. That is not defensiveness for its own sake: chunk lengths are
 * stored rounded, so the sum of them is not exactly what plays, and a
 * bar dragged to its own right-hand end can ask for a second that is
 * fractionally past the last piece's stored length.
 */
export function placeAt(pieces: SpokenSpan[], seconds: number): SpokenPlace {
  if (!pieces.length) return { index: 0, offset: 0 }

  const want = Math.max(0, seconds)
  let passed = 0

  for (let i = 0; i < pieces.length; i++) {
    const length = Math.max(0, pieces[i].seconds)
    // The last piece is the end of the line: anything still unplaced by
    // the time we reach it belongs to it, however the lengths round.
    if (want < passed + length || i === pieces.length - 1) {
      return { index: i, offset: Math.min(Math.max(0, want - passed), length) }
    }
    passed += length
  }

  // Unreachable: the loop returns on its last turn.
  return { index: pieces.length - 1, offset: 0 }
}

/**
 * Seconds as a clock, the way any player prints them.
 *
 * In core because both players print it, and because a position read
 * aloud by a screen reader as "three hundred and forty-two" is a
 * position nobody can use.
 */
export function spokenClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const mins = Math.floor(whole / 60)
  const secs = whole % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
