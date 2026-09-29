'use client'

import { useEffect } from 'react'

/**
 * Registers `public/sw.js` on every sheet.
 *
 * It was registered only by the Tend sheet, when reminders were turned
 * on. It now also receives PDFs from Android's share sheet, and a share
 * that arrives before the worker is installed goes to the server as a
 * form it cannot read. So it is put in place the first time any sheet is
 * opened. Registering again is a no-op, and a browser without service
 * workers loses nothing but the two things the worker does.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch(() => {
        // Not fatal: sharing a PDF and reminders wait for the next sheet.
      })
  }, [])
  return null
}
