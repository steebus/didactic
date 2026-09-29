import type { Api } from './client'

/** A Web Push subscription as `PushSubscription.toJSON()` gives it. */
export interface PushSubscriptionIn {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/**
 * Tend reminders on a phone (069). The web subscribes through the
 * browser's own push service; the phone app will subscribe through its
 * own and send the same shape.
 */
export const push = (api: Api) => ({
  /** The app's public key. 503 when reminders are not set up. */
  key: () => api.get<{ publicKey: string }>('/api/push/key'),
  /** This phone's reminder time, if it is subscribed. */
  status: (endpoint: string) =>
    api.get<{ subscribed: boolean; remindAt: string | null }>(
      `/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`
    ),
  /** This phone says yes: once a day at `remindAt` (`HH:MM`), in the
   *  time zone it is in. */
  subscribe: (subscription: PushSubscriptionIn, timeZone: string, remindAt: string) =>
    api.post<{ ok: true }>('/api/push/subscribe', { subscription, timeZone, remindAt }),
  /** A new time for this phone's reminder. */
  retime: (endpoint: string, remindAt: string, timeZone: string) =>
    api.patch<{ ok: true; remindAt: string }>('/api/push/subscribe', { endpoint, remindAt, timeZone }),
  /** This phone says no. */
  unsubscribe: (endpoint: string) => api.del<{ ok: true }>('/api/push/subscribe', { endpoint }),
  /** A reminder now, to see that they arrive. */
  test: (endpoint: string) => api.post<{ ok: true }>('/api/push/test', { endpoint }),
})
