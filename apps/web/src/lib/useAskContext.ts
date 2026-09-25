'use client'

import { usePathname } from 'next/navigation'
import { useCallback } from 'react'
import type { AskContext, AskRoute } from '@didactic/core/ask'

/**
 * Where the reader is, as the agent needs to hear it.
 *
 * The route and the entity come off the path. The section is read off
 * the rendered headings rather than off the body, because what matters
 * is the one they are actually looking at -- the question the contents
 * rail answers of the scroll, asked of the viewport instead.
 */

/** How far down the viewport a heading has to be before the section
 *  under it counts as the one being read. A shade below the masthead,
 *  so a heading just scrolled past still names its own section. */
const READING_LINE = 120

function routeOf(path: string): { route: AskRoute; entityId?: string } {
  const parts = path.split('/').filter(Boolean)
  if (parts[0] === 'lesson') return { route: 'lesson', entityId: parts[1] }
  if (parts[0] === 'topics') return { route: 'topic', entityId: parts[1] }
  if (parts[0] === 'subjects') return { route: 'subject', entityId: parts[1] }
  if (parts[0] === 'clozes' || parts[0] === 'cards') return { route: 'cards' }
  return { route: 'other' }
}

/**
 * What is on screen, read off the document rather than held in state.
 *
 * Read on demand instead of tracked: the answer is only ever wanted at
 * the moment the disc is pressed, and a scroll listener that set state
 * would re-render the catalogue on every frame of every scroll to keep
 * a value nothing was reading yet.
 */
function readWhereWeAre(): { title?: string; sectionId?: string; sectionText?: string } {
  if (typeof document === 'undefined') return {}

  const title = document.querySelector('main h1')?.textContent?.trim() || undefined

  const headings = Array.from(document.querySelectorAll<HTMLElement>('main h2[id], main h3[id]'))
  if (!headings.length) return { title }

  let current: HTMLElement | undefined
  for (const heading of headings) {
    if (heading.getBoundingClientRect().top <= READING_LINE) current = heading
  }
  const chosen = current ?? headings[0]

  // The prose between this heading and the next. Sent with the question
  // so the common case -- "I don't follow this bit" -- is answerable
  // without a tool call.
  const text: string[] = []
  let node = chosen.nextElementSibling
  while (node && !/^H[123]$/.test(node.tagName)) {
    const words = node.textContent?.trim()
    if (words) text.push(words)
    node = node.nextElementSibling
  }

  return {
    title,
    sectionId: chosen.id,
    sectionText: text.join('\n\n') || undefined,
  }
}

/**
 * Where the reader is, assembled when it is asked for.
 *
 * The route comes off the path, which React already holds. The rest is
 * read out of the document at the moment the panel opens, which is the
 * only moment it matters.
 */
export function useAskContext(): () => AskContext {
  const path = usePathname()

  return useCallback(() => {
    const { route, entityId } = routeOf(path)
    return { route, entityId, ...readWhereWeAre() }
  }, [path])
}
