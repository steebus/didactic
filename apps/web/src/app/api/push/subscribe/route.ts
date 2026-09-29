import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { DEFAULT_REMIND_AT, readRemindAt } from '@didactic/core/tendPush'

/**
 * This phone says yes, or no, to Tend reminders, and when it wants them.
 *
 * Writes only `push_subscriptions` (069), which no cached sheet is read
 * from, so there are no tags to drop.
 *
 * Subscribing also writes the address the round calls
 * (`push_rounds.origin`): it is the address the phone subscribed
 * through, which is the deployment the reminders should come from, and
 * it means nobody has to set it by hand.
 */

/** This phone's reminder time, or `subscribed: false`. */
export async function GET(req: Request) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const endpoint = new URL(req.url).searchParams.get('endpoint')
  if (!endpoint) return NextResponse.json({ error: 'endpoint is required' }, { status: 400 })

  const { data } = await supabaseAdmin()
    .from('push_subscriptions')
    .select('remind_at')
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
    .maybeSingle()
  return NextResponse.json(
    data ? { subscribed: true, remindAt: data.remind_at as string } : { subscribed: false, remindAt: null }
  )
}

export async function POST(req: Request) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { subscription, timeZone, remindAt } = await req.json()
  const endpoint = subscription?.endpoint
  const p256dh = subscription?.keys?.p256dh
  const auth = subscription?.keys?.auth
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || !p256dh || !auth) {
    return NextResponse.json({ error: 'subscription is required' }, { status: 400 })
  }

  const db = supabaseAdmin()
  const { error } = await db.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint,
      p256dh,
      auth,
      time_zone: typeof timeZone === 'string' && timeZone ? timeZone : 'UTC',
      remind_at: readRemindAt(remindAt) ?? DEFAULT_REMIND_AT,
    },
    { onConflict: 'endpoint' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const head = await headers()
  const origin = `${head.get('x-forwarded-proto') ?? 'https'}://${head.get('host')}`
  const { error: roundError } = await db.from('push_rounds').update({ origin }).eq('id', true)
  if (roundError) console.error('push: could not record where the round calls', roundError.message)

  return NextResponse.json({ ok: true })
}

/** A new time for this phone's reminder, and the zone it is in now. */
export async function PATCH(req: Request) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { endpoint, remindAt, timeZone } = await req.json()
  const at = readRemindAt(remindAt)
  if (typeof endpoint !== 'string' || !at) {
    return NextResponse.json({ error: 'endpoint and remindAt (HH:MM) are required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin()
    .from('push_subscriptions')
    .update({
      remind_at: at,
      ...(typeof timeZone === 'string' && timeZone ? { time_zone: timeZone } : {}),
    })
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'This phone is not subscribed.' }, { status: 404 })
  return NextResponse.json({ ok: true, remindAt: at })
}

export async function DELETE(req: Request) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { endpoint } = await req.json()
  if (typeof endpoint !== 'string') {
    return NextResponse.json({ error: 'endpoint is required' }, { status: 400 })
  }

  const { error } = await supabaseAdmin()
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
