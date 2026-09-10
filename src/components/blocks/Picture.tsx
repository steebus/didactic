'use client'

import { useState } from 'react'
import styles from './blocks.module.css'

export interface PictureData {
  url?: string
  alt?: string
  caption?: string
  /** Who it belongs to: printed as the credit, and linked when the URL
   *  is all there is to credit. */
  source?: string
}

/**
 * A picture the lesson points at, rather than one this app keeps.
 *
 * Nothing is uploaded, copied or cached: the writing agent gives a URL
 * it believes in and the browser fetches it from wherever it lives.
 * That has two consequences worth stating rather than hiding.
 *
 * The first is that the picture may not be there. A model cannot check
 * a link, so some of these will be dead on the day they are written and
 * more will die later. A picture that will not load is therefore not an
 * error: the block prints what the picture was of and where it was, and
 * the lesson reads on.
 *
 * The second is that fetching it tells whoever hosts it that somebody
 * here is reading this lesson. Nothing can be done about the request
 * itself -- that is what pointing at a picture means -- but it goes out
 * with no referrer, so the host learns that a browser asked, not which
 * page asked.
 */
export function Picture({ data }: { data: PictureData }) {
  const [failed, setFailed] = useState(false)
  const url = safeUrl(data.url)
  const alt = (data.alt ?? '').trim()

  // A picture with no address is nothing to draw, and one with no
  // description is one nobody reading with their ears can see.
  if (!url || !alt) return null

  return (
    <figure className={styles.figure}>
      {failed ? (
        <p className={styles.pictureGone}>
          A picture of {alt.charAt(0).toLowerCase() + alt.slice(1)} sat here, and is no
          longer where the lesson left it.{' '}
          <a href={url} target="_blank" rel="noreferrer noopener" className={styles.pictureLink}>
            Try it yourself
          </a>
          .
        </p>
      ) : (
        /* Not next/image: this is somebody else's picture on somebody
           else's server, and nothing here optimises, resizes or caches
           it. Optimising would mean fetching it through this app --
           which is hosting it, by another name. */
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={url}
          alt={alt}
          className={styles.picture}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          // The picture starts loading from the server-rendered HTML,
          // so a link that fails fast -- a host that does not exist --
          // can be done failing before there is a handler on the page
          // to hear it. The browser still knows: a picture that has
          // finished with no width to it did not arrive.
          ref={node => {
            if (node?.complete && node.naturalWidth === 0) setFailed(true)
          }}
        />
      )}

      {(data.caption || data.source) && (
        <figcaption className={styles.pictureCaption}>
          {data.caption}
          {data.caption && data.source && ' '}
          {data.source && (
            <span className={styles.pictureCredit}>
              <a
                href={url}
                target="_blank"
                rel="noreferrer noopener"
                className={styles.pictureLink}
              >
                {data.source}
              </a>
            </span>
          )}
        </figcaption>
      )}
    </figure>
  )
}

/**
 * The address, if it is one worth fetching.
 *
 * Only https, and only because everything else a URL field can carry --
 * a `javascript:` handler, a `data:` payload, a plain http host that
 * will be blocked as mixed content anyway -- is either useless here or
 * worse than useless.
 */
function safeUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const url = new URL(raw.trim())
    return url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}
