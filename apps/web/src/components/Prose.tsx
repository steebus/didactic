'use client'

import { useMemo } from 'react'
import { renderMarkdown } from '@/lib/markdown'
import { parseBlocks } from '@/lib/blocks'
import { Block } from './blocks/Block'
import styles from './Prose.module.css'

/**
 * Lesson and refresher bodies come back as markdown. Rendered as plain
 * text they are a wall; parsed they get headings, code, and lists.
 *
 * The source is model output, so it is sanitised rather than trusted:
 * an LLM can be steered by an ingested page into emitting markup.
 */
/**
 * A lesson body: prose, and the blocks set into it.
 *
 * The blocks are lifted out before the markdown is parsed, so their
 * payloads never reach the HTML pipeline at all -- what a block
 * renders is a component reading values, not markup that had to be
 * sanitised into safety. The prose around them is handled exactly as
 * it was.
 */
export function Prose({ markdown }: { markdown: string }) {
  const parts = useMemo(() => parseBlocks(markdown), [markdown])

  return (
    <>
      {parts.map((part, i) =>
        part.kind === 'block' ? (
          <Block key={i} name={part.name} data={part.data} />
        ) : (
          <ProseText key={i} markdown={part.text} />
        )
      )}
    </>
  )
}

function ProseText({ markdown }: { markdown: string }) {
  const html = useMemo(() => renderMarkdown(markdown), [markdown])

  return (
    <div
      className={styles.prose}
      // What the contents list looks for. A heading inside a block is
      // not a section of the lesson, and this is what tells them apart.
      data-prose=""

      // Sanitised immediately above; marked returns an HTML string and
      // there is no safe non-HTML path for parsed markdown.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
