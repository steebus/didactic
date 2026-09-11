'use client'

import { useMemo } from 'react'
import { renderMarkdown, NOTE_TAGS } from '@/lib/markdown'
import styles from './NoteText.module.css'

/**
 * What was written about a passage, printed.
 *
 * Notes are stored as markdown -- the same thing a lesson body is, and
 * for the same reason: it is text first, so it searches as text (the
 * search column indexes the note verbatim, and a note kept as HTML
 * would fill the index with its own tags), and it renders through one
 * pipeline everywhere it appears.
 *
 * Every place a note is shown uses this, so a note reads the same on
 * the lesson, on the topic sheet and on the marked sheet.
 */
export function NoteText({ markdown, className }: { markdown: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(markdown, NOTE_TAGS), [markdown])

  return (
    <div
      className={className ? `${styles.body} ${className}` : styles.body}
      // Sanitised immediately above against the short list a note is
      // allowed to be; there is no safe non-HTML path for parsed
      // markdown.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
