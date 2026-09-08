'use client'

import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import styles from './Prose.module.css'

/**
 * Lesson and refresher bodies come back as markdown. Rendered as plain
 * text they are a wall; parsed they get headings, code, and lists.
 *
 * The source is model output, so it is sanitised rather than trusted:
 * an LLM can be steered by an ingested page into emitting markup.
 */
export function Prose({ markdown }: { markdown: string }) {
  const html = useMemo(() => {
    const raw = marked.parse(markdown, { async: false, gfm: true, breaks: false })
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'hr', 'a',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
      ],
      ALLOWED_ATTR: ['href', 'title'],
      // Links in generated prose open elsewhere; nothing here should be
      // able to script or reach back into the page.
      ADD_ATTR: ['target', 'rel'],
    })
  }, [markdown])

  return (
    <div
      className={styles.prose}
      // Sanitised immediately above; marked returns an HTML string and
      // there is no safe non-HTML path for parsed markdown.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
