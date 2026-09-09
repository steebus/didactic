'use client'

import { useMemo } from 'react'
import { marked } from 'marked'
import createDOMPurify from 'dompurify'
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

/**
 * DOMPurify needs a DOM, and a client component is still rendered once
 * on the server to produce the initial HTML. Returning nothing from
 * that pass leaves the prose blank until hydration and makes the two
 * renders disagree, which React reports as a hydration mismatch.
 *
 * jsdom is already a dependency -- the ingester parses fetched pages
 * with it -- so the server pass gets a window of its own and sanitises
 * exactly as the browser does.
 */
function purifier() {
  if (typeof window !== 'undefined') return createDOMPurify(window)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { JSDOM } = require('jsdom') as typeof import('jsdom')
  return createDOMPurify(new JSDOM('').window as unknown as Window & typeof globalThis)
}

function ProseText({ markdown }: { markdown: string }) {
  const html = useMemo(() => {
    const DOMPurify = purifier()

    const raw = marked.parse(markdown, { async: false, gfm: true, breaks: false })
    // A lesson links out to the reader's own material, which should
    // open beside the lesson rather than replacing it.
    DOMPurify.addHook('afterSanitizeAttributes', node => {
      if (node.tagName === 'A' && node.getAttribute('href')?.startsWith('http')) {
        node.setAttribute('target', '_blank')
        node.setAttribute('rel', 'noreferrer')
      }
    })

    const clean = DOMPurify.sanitize(raw, {
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

    // Hooks are global to DOMPurify, so this one is removed rather than
    // stacking a new copy on every render.
    DOMPurify.removeHook('afterSanitizeAttributes')

    return clean
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
