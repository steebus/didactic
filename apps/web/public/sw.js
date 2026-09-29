/*
 * Didactic's service worker. It does one thing: shows the Tend reminders
 * the daily round sends (`lib/push.ts`), and opens the garden when one is
 * pressed. It caches nothing and answers no fetch, so the app behaves
 * exactly as it does without it.
 */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

self.addEventListener('push', event => {
  let nudge = { title: 'Tend the Garden', body: 'Something is due.', url: '/tend', tag: 'tend' }
  try {
    if (event.data) nudge = { ...nudge, ...event.data.json() }
  } catch {
    // A payload that is not ours to read: the plain reminder stands.
  }
  event.waitUntil(
    self.registration.showNotification(nudge.title, {
      body: nudge.body,
      icon: '/icon.png',
      tag: nudge.tag,
      renotify: true,
      data: { url: nudge.url },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/tend', self.location.origin)
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of open) {
        if (new URL(client.url).origin === url.origin && 'focus' in client) {
          await client.focus()
          if ('navigate' in client) await client.navigate(url.href)
          return
        }
      }
      await self.clients.openWindow(url.href)
    })()
  )
})
