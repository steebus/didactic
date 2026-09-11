/**
 * Words both front ends print.
 *
 * Not every string in the app -- a sheet's own prose stays with the
 * sheet. What is here is what would otherwise be typed twice and drift:
 * the waiting phrases, and the date format the mastheads share.
 */

/**
 * What a button says while a bed is laid out.
 *
 * Sowing takes the better part of a minute -- an LLM call, an embedding
 * per topic and a similarity search per topic -- and a button that only
 * says it is busy for that long reads as a button that has died. None
 * of this corresponds to a real step; it is a gardener's rumour of one,
 * and deliberately not a progress bar, because a bar that cannot know
 * the total lies about how much is left.
 *
 * The list runs once and holds on the last phrase rather than cycling:
 * a label that stops advancing says nearly there, a label that starts
 * again says broken.
 */
export const LABOURS = [
  'Turning the ground…',
  'Sifting the seed…',
  'Reading the packet…',
  'Consulting the almanac…',
  'Squinting at the light…',
  'Measuring the drills…',
  'Arguing with the compost…',
  'Spacing the rows…',
  'Naming the seedlings…',
  'Filing the labels…',
  'Watering in…',
  'Standing back…',
  // The last one holds until the bed comes back, so it has to be a
  // phrase that can be true for a while.
  'Almost done…',
]

/**
 * The same for drawing connections, which is one model call over the
 * whole bed rather than the sowing's several -- so the list is shorter,
 * and holds sooner, which is honest about there being one thing
 * happening rather than twelve.
 */
export const DRAWINGS = [
  'Walking the bed…',
  'Looking for what leads to what…',
  'Following the paths…',
  'Tying in the runners…',
  'Ruling the lines…',
  'Standing back…',
  'Almost done…',
]

/**
 * The same again for writing a lesson, which is one model call and
 * sometimes a second to finish a body that hit the token ceiling.
 *
 * A different register on purpose: sowing and relating are work done to
 * the bed, and this is work done at the desk. The reader who presses
 * "Write this lesson" from a topic sheet is waiting on a page being
 * written, not on ground being turned, and a wait that describes the
 * wrong thing is a wait that reads as the wrong button.
 */
export const WRITINGS = [
  'Sharpening the pencil…',
  'Reading round the subject…',
  'Finding the thread…',
  'Drafting the opening…',
  'Working the middle…',
  'Drawing the figures…',
  'Checking it against the shelf…',
  'Reading it back…',
  'Almost done…',
]

/**
 * The phrase for a given tick of a wait, holding on the last.
 *
 * The timing stays with each platform -- an interval on the web, a
 * driver on the phone -- but which phrase a step lands on does not.
 */
export function labourPhrase(step: number, phrases: string[] = LABOURS): string {
  return phrases[Math.min(Math.max(step, 0), phrases.length - 1)]
}

/**
 * The date a masthead prints: 9 September 2026.
 *
 * The stock list and the subject sheet had a formatter each, declared
 * identically and separately, which is two places for a house style to
 * drift. One here, and the phone reads the same one.
 */
export const EDITION_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** That format applied, for the common case of a date string or Date. */
export function editionDate(on: Date | string = new Date()): string {
  return EDITION_DATE.format(typeof on === 'string' ? new Date(on) : on)
}
