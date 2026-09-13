'use client'

import { useMemo } from 'react'
import { renderInline } from '@/lib/markdown'

/**
 * One line of model-written text, formatted.
 *
 * The blocks and the cloze card both print single lines that came from
 * a model: a question, an option, a step, the passage a cloze was cut
 * from. Those lines carry the same emphasis and the same notation as
 * the prose around them, and printing them raw is how a question about
 * $2^x = 100$ came to ask about a row of dollar signs.
 *
 * `span` rather than a block element, so it can sit inside the `<th>`,
 * `<button>` or `<li>` the caller already drew. Sanitised immediately
 * above on an allowlist that admits emphasis, code and mathematics and
 * nothing else -- see `INLINE_TAGS`.
 */
export function Rich({
  text,
  className,
  as: Tag = 'span',
}: {
  /** A field a model may simply not have filled in. */
  text?: string
  className?: string
  /** The element to render into, where the caller needs a particular one. */
  as?: 'span' | 'p' | 'div'
}) {
  const html = useMemo(() => renderInline(text ?? ''), [text])

  // A missing field is a field to leave out, which is how every block
  // already treats its payload. Rendering an empty element instead
  // would leave the furniture's own spacing standing around nothing.
  if (!text?.trim()) return null

  return (
    <Tag
      className={className}
      // Sanitised in `renderInline`; marked returns an HTML string and
      // there is no safe non-HTML path for parsed markdown.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
