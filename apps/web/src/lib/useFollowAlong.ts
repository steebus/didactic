'use client'

import { useEffect } from 'react'

/**
 * Mark the paragraph the voice is on.
 *
 * Done against the rendered page rather than in the render, because the
 * prose reaches the sheet as sanitised HTML in one `dangerouslySetInnerHTML`
 * -- there are no React nodes per paragraph to hand a prop to, and
 * making some would mean a second markdown pipeline whose only job is
 * to disagree with the first one eventually.
 *
 * So the recording says what it is saying, in words, and this finds the
 * element whose words those are. Matching on the opening of the passage
 * rather than the whole of it: a chunk is sometimes a heading and the
 * paragraph beneath it, sometimes half a paragraph too long to say in
 * one go, and the sheet has neither of those as an element. The opening
 * is what the two always share.
 *
 * A data attribute rather than a class, so the styling lives with the
 * sheet's own stylesheet and this file decides nothing about how it
 * looks.
 */
export function useFollowAlong(root: HTMLElement | null, saying: string | null) {
  useEffect(() => {
    if (!root) return

    const marked = root.querySelectorAll('[data-saying]')
    for (const el of marked) el.removeAttribute('data-saying')

    if (!saying) return

    const opening = norm(saying).slice(0, 40)
    if (!opening) return

    // Only the elements that hold prose.
    //
    // Not the contents list, which is the trap here: it repeats every
    // heading in the lesson, word for word, and stands above the prose
    // in the document -- so a chunk that opens on a heading matched its
    // own entry in the table of contents and marked a line in the
    // index instead of the passage being read. It is a `nav`, and
    // anything else that navigates rather than says is one too.
    const candidates = root.querySelectorAll('p, li, h1, h2, h3, h4')
    for (const el of candidates) {
      if (el.closest('nav')) continue
      if (norm(el.textContent ?? '').startsWith(opening.slice(0, 24))) {
        el.setAttribute('data-saying', 'true')
        return
      }
    }
  }, [root, saying])
}

/** The same reduction the player matches through: words only. */
function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
