'use client'

import { useEffect, useMemo, type RefObject } from 'react'
import { lessonSections } from '@didactic/core/sections'
import { setHash } from '@/lib/hash'
import styles from './Contents.module.css'

/** Below this a contents list is longer than what it lists. */
const WORTH_LISTING = 2

/**
 * What a lesson is made of, printed at the top of it.
 *
 * The list is read out of the markdown; the ids the list points at are
 * stamped onto the headings once they are on the page. Both come from
 * the same reading of the same document, in the same order, so the two
 * cannot drift apart -- and the headings the renderer draws are found
 * through the prose containers it draws them in, so a heading inside a
 * block is neither listed nor stamped.
 */
export function Contents({
  root,
  body,
}: {
  /** The element the lesson body is rendered into. */
  root: RefObject<HTMLElement | null>
  /** The lesson, as markdown. */
  body: string
}) {
  const sections = useMemo(() => lessonSections(body), [body])

  useEffect(() => {
    const element = root.current
    if (!element) return
    const headings = element.querySelectorAll('[data-prose] h1, [data-prose] h2, [data-prose] h3')
    headings.forEach((heading, i) => {
      // A heading the reading above did not account for is left alone
      // rather than stamped with the name of a section it is not.
      if (sections[i]) heading.id = sections[i].id
    })
  }, [root, sections])

  if (sections.length < WORTH_LISTING) return null

  return (
    <nav className={styles.contents} aria-label="What is in this lesson">
      <p className={styles.label}>Contents</p>
      <ol className={styles.list}>
        {sections.map(section => (
          <li
            key={section.id}
            className={section.level > 2 ? `${styles.item} ${styles.under}` : styles.item}
          >
            {/* A real anchor, so it can be opened in a tab or copied
                like any other link. The press is taken over only to
                travel rather than jump. */}
            <a
              href={`#${section.id}`}
              className={styles.link}
              onClick={e => {
                const target = document.getElementById(section.id)
                if (!target || e.metaKey || e.ctrlKey || e.shiftKey) return
                e.preventDefault()
                target.scrollIntoView({ behavior: 'smooth', block: 'start' })
                // The address bar keeps up without stacking a history
                // entry for every section anyone glanced at -- and
                // without the router reading the new URL as somewhere
                // to travel to. See `setHash`.
                setHash(`#${section.id}`)
              }}
            >
              {section.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
