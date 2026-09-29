import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'

/**
 * This phone says yes, or no, to Tend reminders.
 *
 * Writes only `push_subscriptions` (069), which no cached sheet is read
 * from, so there are no tags to drop.
 *
 * Subscribing also writes the address the hourly round calls
 * (`push_rounds.origin`): it is the address the phone subscribed
 * through, which is the deployment the reminders should come from, and
 * it means nobody has to set it by hand.
 */
export async function POST(req: Request) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { subscription, timeZone } = await req.json()
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
