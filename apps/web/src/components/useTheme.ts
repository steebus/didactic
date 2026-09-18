'use client'

import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

/** Where the choice is kept, and what the document is stamped with. */
const KEY = 'didactic-theme'

/**
 * Which lighting condition the sheet is being read under.
 *
 * Three states, not two: an explicit choice stamps `data-theme` on the
 * document, and the default setting stamps nothing and follows the
 * reader's own system. Everything painted in CSS follows that stamp on
 * its own -- this hook exists for the one surface that cannot, the
 * graph canvas, which paints to a bitmap where no custom property
 * reaches.
 *
 * `useSyncExternalStore` rather than state and an effect, because that
 * is what this is: the browser owns the value, the document's stamp and
 * the system setting can both change it from outside React, and the
 * server has a different answer from the client. Reading it in an
 * effect meant setting state during mount and painting the bed twice.
 */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, read, () => 'light' as const)
}

/** What the document is actually showing, right now. */
function read(): Theme {
  const stamped = document.documentElement.dataset.theme
  if (stamped === 'dark' || stamped === 'light') return stamped
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Both ways the answer can change: the reader's system turning dark
 * under someone who has stated no preference, and the toggle stamping
 * the document.
 */
function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', onChange)

  const watcher = new MutationObserver(onChange)
  watcher.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })

  return () => {
    media.removeEventListener('change', onChange)
    watcher.disconnect()
  }
}

/**
 * The stored choice, or `null` where the reader has stated none.
 *
 * Used by the toggle, and stated again as an inline script in
 * `layout.tsx` which has to stamp the document before the first paint.
 */
export function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'dark' || v === 'light' ? v : null
  } catch {
    // A browser with site data blocked still gets a working sheet; it
    // simply follows the system every time.
    return null
  }
}

/** Stamp the document and remember it. `null` is "follow the system". */
export function setStoredTheme(theme: Theme | null) {
  if (theme === null) {
    delete document.documentElement.dataset.theme
    try { localStorage.removeItem(KEY) } catch {}
    return
  }
  document.documentElement.dataset.theme = theme
  try { localStorage.setItem(KEY, theme) } catch {}
}

export { KEY as THEME_KEY }
