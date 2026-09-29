import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { countClozes } from '@/lib/clozes'
import { sendNudge } from '@/lib/push'
import { nudgeMessage } from '@didactic/core/tendPush'

/**
 * Send this phone a reminder now, whatever the hour and however long
 * since the last: the way to see that reminders reach it at all. Does not
 * count as the day's reminder, so the one at the chosen time still comes.
 */
export async function POST(req: Request) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { endpoint } = await req.json()
  const db = supabaseAdmin()
  const { data: sub } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
    .maybeSingle()
  if (!sub) return NextResponse.json({ error: 'This phone is not subscribed.' }, { status: 404 })

  const { due } = await countClozes(db, userId)
  const outcome = await sendNudge(db, sub, nudgeMessage(Math.max(due, 1)))
  if (outcome === 'sent') return NextResponse.json({ ok: true })
  return NextResponse.json(
    { error: outcome === 'gone' ? 'The phone has forgotten this subscription. Turn reminders on again.' : 'It could not be sent.' },
    { status: 502 }
  )
}
