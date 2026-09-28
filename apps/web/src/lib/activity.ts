import { connection } from 'next/server'
import { activityDays, type ActivityCount, type ActivityDay } from '@didactic/core/activity'
import { ACTIVITY } from '@didactic/core/config'
import { supabaseAdmin } from './supabase'

const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: ACTIVITY.TZ })

/**
 * The reader's year, for the activity rule under the masthead.
 *
 * Deliberately not cached. The home read is held on the map's tags, and
 * a flashcard review, a marked passage or a lesson answer drops none of
 * them -- cached alongside, the strip would sit on last week until a
 * subject changed. It is one round trip, and the sheet streams it in
 * behind a `Suspense` so the stock list never waits on it.
 *
 * Empty on any error, which includes the function not existing yet: a
 * deploy that lands before `064` has run shows the plain rule.
 */
export async function getActivity(): Promise<ActivityDay[]> {
  await connection()
  const today = TODAY.format(new Date())
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - (ACTIVITY.DAYS - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10)

  const { data, error } = await supabaseAdmin().rpc('activity_days', { p_since: since, p_tz: ACTIVITY.TZ })
  if (error || !data) return []

  const rows = (data as Array<{ day: string; subject_id: string | null; kind: ActivityCount['kind']; n: number }>)
    .map(r => ({ day: r.day, subjectId: r.subject_id, kind: r.kind, n: r.n }))
  return rows.length ? activityDays(rows, today) : []
}
