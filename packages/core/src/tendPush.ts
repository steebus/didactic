import { tendPhrase } from './clozes'

/**
 * When the garden may ask on the phone, and what it says.
 *
 * The same rule as the notice in the corner of the catalogue
 * (`TendNotice`): at most once in four hours, and only when something is
 * due. A notification that arrives every time a card falls due is one
 * the reader learns to swipe away unread, and that is worse than none.
 *
 * One more rule the notice never needed, since it only speaks while the
 * reader is looking: not at night. The hours are the reader's own,
 * read in the time zone the phone gave when reminders were turned on.
 *
 * Pure, and here rather than in the route, so the phone's own
 * notifications keep the same rhythm when it has them.
 */

/** At most this often. */
export const NUDGE_EVERY_MS = 4 * 60 * 60 * 1000

/** The hours a reminder may arrive in, local time: from, up to but not
 *  including to. */
export const WAKING_HOURS = { from: 8, to: 21 } as const

/** The hour it is where the reader is. An unknown zone is read as UTC
 *  rather than failing the round: the worst case is a reminder at an
 *  odd hour, not none at all. */
export function localHour(now: Date, timeZone: string): number {
  try {
    const hour = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(now)
    return Number(hour) % 24
  } catch {
    return now.getUTCHours()
  }
}

export interface NudgeInput {
  /** Cards due now. */
  due: number
  /** When this phone was last reminded, or null for never. */
  lastSentAt: string | null
  now: Date
  timeZone: string
}

export function shouldNudge({ due, lastSentAt, now, timeZone }: NudgeInput): boolean {
  if (due <= 0) return false
  const hour = localHour(now, timeZone)
  if (hour < WAKING_HOURS.from || hour >= WAKING_HOURS.to) return false
  if (lastSentAt === null) return true
  const since = now.getTime() - Date.parse(lastSentAt)
  // An unreadable time is treated as long ago: a reminder too many is a
  // smaller fault than reminders stopping for good.
  return Number.isNaN(since) || since >= NUDGE_EVERY_MS
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
