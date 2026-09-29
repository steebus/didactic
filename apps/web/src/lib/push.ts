import webpush, { WebPushError } from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import { countClozes } from './clozes'
import { nudgeMessage, shouldNudge, type Nudge } from '@didactic/core/tendPush'

/**
 * Tend reminders, sent to a phone through Web Push.
 *
 * Signed with the app's VAPID pair, which is what the phone's push
 * service knows this server by. The pair is made here the first time a
 * phone asks for it and kept in `push_rounds` (070), so there is nothing
 * to generate or set by hand. It is written only where it is still
 * empty and read back after, so two first asks at once agree on one
 * pair: every subscription is bound to the public key it was made with,
 * and a second pair would silence every phone made against the first.
 *
 * Null only before 070 has run, or when the database cannot be reached;
 * the Tend sheet then says reminders are not set up.
 */
export async function pushKeys(
  db: SupabaseClient
): Promise<{ publicKey: string; privateKey: string } | null> {
  const read = async () => {
    const { data, error } = await db
      .from('push_rounds')
      .select('vapid_public, vapid_private')
      .eq('id', true)
      .maybeSingle()
    if (error) {
      console.error('push: could not read the key pair', error.message)
      return undefined
    }
    return data?.vapid_public && data.vapid_private
      ? { publicKey: data.vapid_public as string, privateKey: data.vapid_private as string }
      : null
  }

  const kept = await read()
  if (kept !== null) return kept ?? null

  const made = webpush.generateVAPIDKeys()
  const { error } = await db
    .from('push_rounds')
    .update({ vapid_public: made.publicKey, vapid_private: made.privateKey })
    .eq('id', true)
    .is('vapid_public', null)
  if (error) {
    console.error('push: could not keep a new key pair', error.message)
    return null
  }
  return (await read()) ?? null
}

interface Subscription {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  time_zone: string
  remind_at: string
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
  const keys = await pushKeys(db)
  if (!keys) return 'failed'
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:owner@didactic.invalid',
    keys.publicKey,
    keys.privateKey
  )
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(nudge),
      // A morning reminder at teatime is not a reminder; let the
      // service drop it if the phone has been off for an hour.
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
    .select('id, user_id, endpoint, p256dh, auth, time_zone, remind_at, last_sent_at')
  if (error) throw error

  const subs = (data ?? []) as Subscription[]
  const dueBy = new Map<string, number>()
  const tally = { phones: subs.length, sent: 0, gone: 0, failed: 0, quiet: 0 }

  for (const sub of subs) {
    // The time first: most rounds are not anyone's time, and they
    // should cost no count at all.
    const timing = { lastSentAt: sub.last_sent_at, remindAt: sub.remind_at, now, timeZone: sub.time_zone }
    if (!shouldNudge({ ...timing, due: 1 })) {
      tally.quiet++
      continue
    }
    if (!dueBy.has(sub.user_id)) {
      dueBy.set(sub.user_id, (await countClozes(db, sub.user_id)).due)
    }
    const due = dueBy.get(sub.user_id)!
    if (!shouldNudge({ ...timing, due })) {
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
