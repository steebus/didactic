'use client'

import { useSyncExternalStore } from 'react'
import styles from './page.module.css'

/** Nothing here re-subscribes: the fragment is read once, when the
 *  frame is first pointed somewhere. */
const noop = () => () => {}

/**
 * The document, in the browser's own viewer.
 *
 * A client component for one reason: the page to open at arrives in
 * the address's fragment, and a fragment is never sent to the server.
 * A citation of page forty links here with `#page=40`, and the viewer
 * only opens there if the fragment is read in the browser and put on
 * the frame's own address.
 *
 * Read through `useSyncExternalStore` rather than in an effect, so the
 * frame is pointed at the right page on its first render instead of
 * being pointed at page one and moved -- which would cost a second
 * fetch of the file and show the front of the document on the way.
 * The server snapshot is the plain URL, which is what renders in the
 * HTML and what a reader who arrived without a fragment sees.
 *
 * Deliberately not subscribed to later hash changes: a reader who has
 * paged through to page ninety should not be thrown back to forty, and
 * the browser's viewer has its own page box for going somewhere
 * deliberately.
 */
export function Viewer({ url, title }: { url: string; title: string }) {
  const src = useSyncExternalStore(
    noop,
    () => {
      // Only a page, and only a number: the fragment is put on the URL
      // the frame is pointed at, so nothing else is worth carrying.
      const page = /^#page=(\d+)$/.exec(window.location.hash)?.[1]
      return page ? `${url}#page=${page}` : url
    },
    () => url
  )

  return <iframe className={styles.viewer} src={src} title={title} />
}
