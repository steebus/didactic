import { tendPhrase } from './clozes'

/**
 * When the garden may ask on the phone, and what it says.
 *
 * Once a day, at the time the reader chose, and only when something is
 * due. A reminder that arrives whenever a card falls due is one the
 * reader learns to swipe away unread; one that arrives at the same time
 * every day, when they said they would have a few minutes, is a habit.
 *
 * The time is the reader's own, read in the time zone the phone gave
 * when reminders were turned on. The round runs every quarter hour, so a
 * reminder lands within fifteen minutes of the time; a round that was
 * missed is made up for within `CATCH_UP_MIN`, and after that the day is
 * let go rather than a morning reminder arriving at teatime.
 *
 * Pure, and here rather than in the route, so the phone's own
 * notifications keep the same rhythm when it has them.
 */

/** The time a phone is reminded at, until the reader picks another. */
export const DEFAULT_REMIND_AT = '08:00'

/** How long after the chosen time a missed round may still send. */
export const CATCH_UP_MIN = 120

/** A time of day as `HH:MM`, 24-hour, or null for anything else. */
export function readRemindAt(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const m = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  return m ? `${m[1]}:${m[2]}` : null
}

/** Where the reader is: the date, and the minutes into the day. An
 *  unknown zone is read as UTC rather than failing the round: the worst
 *  case is a reminder at an odd hour, not none at all. */
export function localClock(now: Date, timeZone: string): { date: string; minutes: number } {
  const read = (zone: string) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now)
    const part = (type: string) => parts.find(p => p.type === type)?.value ?? '00'
    return {
      date: `${part('year')}-${part('month')}-${part('day')}`,
      minutes: (Number(part('hour')) % 24) * 60 + Number(part('minute')),
    }
  }
  try {
    return read(timeZone)
  } catch {
    return read('UTC')
  }
}

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

export interface NudgeInput {
  /** Cards due now. */
  due: number
  /** When this phone was last reminded, or null for never. */
  lastSentAt: string | null
  /** The time of day the reader chose, `HH:MM`. */
  remindAt: string
  now: Date
  timeZone: string
}

export function shouldNudge({ due, lastSentAt, remindAt, now, timeZone }: NudgeInput): boolean {
  if (due <= 0) return false
  const at = minutesOf(readRemindAt(remindAt) ?? DEFAULT_REMIND_AT)
  const here = localClock(now, timeZone)
  const late = here.minutes - at
  if (late < 0 || late > CATCH_UP_MIN) return false
  if (lastSentAt === null) return true
  const last = new Date(lastSentAt)
  // An unreadable time is treated as another day: a reminder too many is
  // a smaller fault than reminders stopping for good.
  if (Number.isNaN(last.getTime())) return true
  return localClock(last, timeZone).date !== here.date
}

/** What the notification says, and where pressing it goes. */
export interface Nudge {
  title: string
  body: string
  url: string
  /** One reminder stands at a time: a new one replaces the last. */
  tag: string
}

export function nudgeMessage(due: number): Nudge {
  return {
    title: 'Tend the Garden',
    body: `${tendPhrase(due)}. A few minutes over what you have already read.`,
    url: '/tend',
    tag: 'tend',
  }
}
