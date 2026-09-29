/*
 * Didactic's service worker. Two jobs, and nothing else:
 *
 * - It shows the Tend reminders the daily round sends (`lib/push.ts`),
 *   and opens the garden when one is pressed.
 * - It receives what Android's share sheet sends (`app/manifest.ts`).
 *   A shared file comes as a form POST, and a PDF is routinely larger
 *   than a function will take, so it never goes to the server this way:
 *   it is held here for a moment and `/send` uploads it straight to
 *   storage, as the upload on the inbox does. A shared link is turned
 *   back into the address `/send` has always read.
 *
 * It caches nothing else and answers no other fetch, so the app behaves
 * exactly as it does without it.
 */

/** Where a shared file waits for `/send` to take it. `SendSheet` reads
 *  the same two names. */
const SHARED_CACHE = 'didactic-shared'
const SHARED_FILE = '/send/shared-file'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || url.origin !== self.location.origin || url.pathname !== '/send') return
  event.respondWith(receiveShare(event.request))
})

async function receiveShare(request) {
  const form = await request.formData()
  const field = name => {
    const value = form.get(name)
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }
  const next = new URL('/send', self.location.origin)
  const file = form.getAll('file').find(f => f && typeof f !== 'string' && f.size > 0)

  if (file) {
    const cache = await caches.open(SHARED_CACHE)
    await cache.put(
      SHARED_FILE,
      new Response(file, {
        headers: {
          'content-type': file.type || 'application/octet-stream',
          'x-file-name': encodeURIComponent(file.name || 'Shared document.pdf'),
        },
      })
    )
    next.searchParams.set('file', '1')
  } else {
    for (const name of ['url', 'title', 'text']) {
      const value = field(name)
      if (value) next.searchParams.set(name, value)
    }
  }
  return Response.redirect(next.href, 303)
}

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
