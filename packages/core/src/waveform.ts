/**
 * The mark that says *this is a voice, and it is running*.
 *
 * Five bars at different heights: the shape a recording makes when it
 * is drawn rather than described. It stands in two places and they are
 * the same mark, which is the whole reason it is here rather than
 * written into the player twice -- on the bar beside the clock, and in
 * the middle of the disc the player folds down to.
 *
 * The disc wore a chevron up. That is the honest picture of *this
 * opens*, and it is the wrong thing to say: a chevron is what every
 * collapsed panel in every app wears, and the one fact worth carrying
 * at that size is not that the thing opens but that a lesson is being
 * read aloud right now. The rim already says how far in. The middle
 * now says what it is.
 *
 * At rest the bars hold `rest` -- a silhouette, still a waveform, so
 * the mark reads as sound even paused, even under a reader who has
 * asked for no motion. While the voice is running each bar swings
 * between `WAVE_LOW` and full, on one duration and its own offset, so
 * the row moves without travelling: staggered rather than marching,
 * because a left-to-right sweep is what a progress spinner does and
 * this is not one.
 *
 * Here rather than in the component for the reason `specimens` and
 * `lighting` are here: the web draws this with `<svg>` and the phone
 * will draw it with `react-native-svg`, so the elements cannot be
 * shared, but the geometry and the timing must be or the same voice
 * looks like two different ones.
 */

/** The box the bars are drawn in. Wider than tall, as a waveform is. */
export const WAVE_WIDTH = 18
export const WAVE_HEIGHT = 12

/** One bar's width, and the gap that follows it. Two and two put five
 *  bars across eighteen with nothing left over. */
export const WAVE_BAR = 2
export const WAVE_GAP = 2

/** The bar's corner. Enough to take the print off a hard edge, little
 *  enough that scaling one vertically does not visibly pull it. */
export const WAVE_RADIUS = 0.9

/**
 * One bar: where it stands, how tall it is when nothing is playing,
 * and how far into the loop it starts.
 *
 * `rest` and `delay` are both fractions -- of the box's height, and of
 * one swing -- rather than pixels and milliseconds, because the two
 * platforms draw at different sizes and drive the motion with
 * different machinery. A fraction survives both.
 */
export interface WaveBar {
  x: number
  rest: number
  delay: number
}

/**
 * The five.
 *
 * `rest` is a silhouette read from the middle out: tallest in the
 * centre, falling away unevenly on either side, because a voice drawn
 * symmetrically reads as a diagram of one. `delay` is deliberately not
 * in order -- 0, .62, .24, .8, .43 -- since bars that start in
 * sequence march, and a row that marches is a thing loading rather
 * than a thing sounding.
 */
export const WAVE_BARS: readonly WaveBar[] = [
  { x: 0, rest: 0.4, delay: 0 },
  { x: 4, rest: 0.75, delay: 0.62 },
  { x: 8, rest: 1, delay: 0.24 },
  { x: 12, rest: 0.65, delay: 0.8 },
  { x: 16, rest: 0.45, delay: 0.43 },
]

/**
 * How long one swing takes, in milliseconds.
 *
 * One swing, not one round trip: the motion runs out and back, so what
 * the eye sees repeat is twice this. Slow enough at 620 that it reads
 * as a voice rather than as an alarm, and it is running in the corner
 * of the sheet for twelve minutes at a time.
 */
export const WAVE_SWING_MS = 620

/** How far a bar drops at the bottom of its swing. Not to nothing: a
 *  bar that reached zero would blink out and the row would read as
 *  five things flashing rather than one thing sounding. */
export const WAVE_LOW = 0.3
