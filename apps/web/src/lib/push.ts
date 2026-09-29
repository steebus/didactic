import webpush, { WebPushError } from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import { countClozes } from './clozes'
import { nudgeMessage, shouldNudge, type Nudge } from '@didactic/core/tendPush'

/**
 * Tend reminders, sent to a phone through Web Push.
 *
 * The keys are the app's VAPID pair: `VAPID_PUBLIC_KEY` and
 * `VAPID_PRIVATE_KEY`, made once with `npx web-push generate-vapid-keys`
 * and set on Vercel. Read at runtime rather than inlined into the build,
 * so setting them needs a redeploy of nothing but the environment.
 * Without them there are no reminders, and the Tend sheet says so rather
 * than offering a switch that does nothing.
 */
export function pushKeys(): { publicKey: string; privateKey: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  return publicKey && privateKey ? { publicKey, privateKey } : null
}

interface Subscription {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  time_zone: string
  last_sent_at: string | null
}

/**
 * Send one notification to one phone.
 *
 * `gone` is a subscription the push service has forgotten -- the app was
 * uninstalled, or notifications were turned off in Android's settings --
 * which is deleted rather than tried again every hour for ever.
 */
export async function sendNudge(
  db: SupabaseClient,
  sub: Pick<Subscription, 'id' | 'endpoint' | 'p256dh' | 'auth'>,
  nudge: Nudge
): Promise<'sent' | 'gone' | 'failed'> {
  const keys = pushKeys()
  if (!keys) return 'failed'
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:owner@didactic.invalid',
    keys.publicKey,
    keys.privateKey
  )
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(nudge),
      // A reminder four hours late is not a reminder; let the service
      // drop it if the phone has been off all afternoon.
      { TTL: 60 * 60, urgency: 'normal', topic: nudge.tag }
    )
    return 'sent'
  } catch (e) {
    if (e instanceof WebPushError && (e.statusCode === 404 || e.statusCode === 410)) {
      await db.from('push_subscriptions').delete().eq('id', sub.id)
      return 'gone'
    }
    console.error('push: could not send', e instanceof Error ? e.message : e)
    return 'failed'
  }
}

/**
 * One round: every phone that has said yes is asked about, and reminded
 * where `core/tendPush.shouldNudge` says it is time.
 */
export async function tendRound(db: SupabaseClient, now = new Date()) {
  const { data, error } = await db
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth, time_zone, last_sent_at')
  if (error) throw error

  const subs = (data ?? []) as Subscription[]
  const dueBy = new Map<string, number>()
  const tally = { phones: subs.length, sent: 0, gone: 0, failed: 0, quiet: 0 }

  for (const sub of subs) {
    if (!dueBy.has(sub.user_id)) {
      dueBy.set(sub.user_id, (await countClozes(db, sub.user_id)).due)
    }
    const due = dueBy.get(sub.user_id)!
    if (!shouldNudge({ due, lastSentAt: sub.last_sent_at, now, timeZone: sub.time_zone })) {
      tally.quiet++
      continue
    }
    const outcome = await sendNudge(db, sub, nudgeMessage(due))
    tally[outcome]++
    if (outcome === 'sent') {
      await db.from('push_subscriptions').update({ last_sent_at: now.toISOString() }).eq('id', sub.id)
    }
  }

  return tally
}
