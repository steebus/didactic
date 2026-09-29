'use client'

import { useEffect, useState } from 'react'
import { didactic } from '@didactic/api'
import styles from './page.module.css'

const api = didactic()

type State =
  | { at: 'looking' }
  /** No service worker or push in this browser. */
  | { at: 'unsupported' }
  /** The deployment has no push keys. */
  | { at: 'unset'; why: string }
  /** Notifications are blocked for the site in the phone's settings. */
  | { at: 'blocked' }
  | { at: 'off' }
  | { at: 'on'; endpoint: string }

/** The key as the browser wants it: bytes, from URL-safe base64. */
function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/**
 * Tend reminders on this phone: the four-hourly notice (`TendNotice`),
 * sent as an Android notification when the app is not open.
 *
 * At the foot of the garden because that is where the reader is when
 * they are thinking about tending, and because a switch for reminders
 * belongs to the thing it reminds about. Per phone: each one says yes
 * for itself, in its own time zone, and turning it off here turns off
 * only this one.
 */
export function TendReminders() {
  const [state, setState] = useState<State>({ at: 'looking' })
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        if (live) setState({ at: 'unsupported' })
        return
      }
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      const sub = await reg.pushManager.getSubscription()
      if (!live) return
      if (Notification.permission === 'denied') setState({ at: 'blocked' })
      else if (sub) setState({ at: 'on', endpoint: sub.endpoint })
      else setState({ at: 'off' })
    })().catch(() => live && setState({ at: 'unsupported' }))
    return () => {
      live = false
    }
  }, [])

  async function turnOn() {
    setBusy(true)
    setSaid(null)
    try {
      const key = await api.push.key()
      if (!key.ok) {
        setState({ at: 'unset', why: key.error ?? 'Reminders are not set up.' })
        return
      }
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? { at: 'blocked' } : { at: 'off' })
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(key.body.publicKey),
        }))
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
      const saved = await api.push.subscribe(json, Intl.DateTimeFormat().resolvedOptions().timeZone)
      if (!saved.ok) {
        await sub.unsubscribe()
        setSaid(saved.error ?? 'It could not be turned on.')
        return
      }
      setState({ at: 'on', endpoint: sub.endpoint })
      setSaid('On. The garden will ask here when something is due, no more than every four hours, and not at night.')
    } catch (e) {
      setSaid(e instanceof Error ? e.message : 'It could not be turned on.')
    } finally {
      setBusy(false)
    }
  }

  async function turnOff(endpoint: string) {
    setBusy(true)
    setSaid(null)
    try {
      const reg = await navigator.serviceWorker.ready
      await (await reg.pushManager.getSubscription())?.unsubscribe()
      await api.push.unsubscribe(endpoint)
      setState({ at: 'off' })
    } finally {
      setBusy(false)
    }
  }

  async function test(endpoint: string) {
    setBusy(true)
    setSaid(null)
    const sent = await api.push.test(endpoint)
    setSaid(sent.ok ? 'Sent. It should arrive in a moment.' : (sent.error ?? 'It could not be sent.'))
    setBusy(false)
  }

  if (state.at === 'looking') return null

  return (
    <section className={styles.reminders} aria-live="polite">
      <h2 className={styles.remindersTitle}>Reminders on this phone</h2>

      {state.at === 'unsupported' && (
        <p className={styles.remindersNote}>
          This browser cannot show reminders. On Android, open Didactic in Chrome or install it
          to the home screen.
        </p>
      )}
      {state.at === 'unset' && <p className={styles.remindersNote}>{state.why}</p>}
      {state.at === 'blocked' && (
        <p className={styles.remindersNote}>
          Notifications are blocked for Didactic. Allow them in the phone’s settings for the app
          (or for this site in Chrome), then come back here.
        </p>
      )}
      {state.at === 'off' && (
        <>
          <p className={styles.remindersNote}>
            A notification when cards are due: no more than every four hours, and not between nine
            at night and eight in the morning.
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.action} onClick={() => void turnOn()} disabled={busy}>
              {busy ? 'Asking…' : 'Remind me here'}
            </button>
          </div>
        </>
      )}
      {state.at === 'on' && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.quietAction}
            onClick={() => void test(state.endpoint)}
            disabled={busy}
          >
            Send one now
          </button>
          <button
            type="button"
            className={styles.quietAction}
            onClick={() => void turnOff(state.endpoint)}
            disabled={busy}
          >
            Turn off
          </button>
        </div>
      )}
      {said && <p className={styles.remindersNote}>{said}</p>}
      {state.at === 'on' && !said && (
        <p className={styles.remindersNote}>On. The garden asks here when something is due.</p>
      )}
    </section>
  )
}
