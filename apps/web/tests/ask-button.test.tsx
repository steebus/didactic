// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

vi.mock('next/navigation', () => ({ usePathname: () => '/lesson/l1' }))

// One conversation already had on the page; reading it back answers with
// its lines. Asking is never sent in these tests.
const read = vi.fn(async () => ({
  ok: true,
  body: {
    messages: [{ role: 'user', content: 'Why a longer lens?' }],
    context: { quote: undefined },
    folded: false,
  },
}))
vi.mock('@didactic/api', () => ({
  didactic: () => ({
    ask: {
      list: vi.fn(async () => ({
        ok: true,
        body: {
          chats: [
            {
              id: 'c1',
              startedAt: '2026-09-29T10:00:00Z',
              context: { route: 'lesson', entityId: 'l1' },
              opening: 'Why a longer lens?',
              said: 2,
              kept: { marks: 0, cards: 0, topics: 0 },
              folded: false,
              lessonId: 'l1',
              topicId: null,
            },
          ],
        },
      })),
      read,
    },
  }),
}))

const { AskButton } = await import('@/components/AskButton')

/**
 * The desk's two ask buttons: *Ask* opens the panel on a new question,
 * *Asked here* opens the list of what was asked on the page and nothing
 * else. The panel comes only from the list, on the conversation picked
 * or on a new one; and while the list is out the sheet moves over for
 * it, as it does for the marks' list.
 */

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  // jsdom lays nothing out; the panel keeps its newest line in view.
  Element.prototype.scrollTo = () => {}
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<AskButton />))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  read.mockClear()
})

const drawer = () => document.querySelector('aside[aria-label="Questions asked here"]')
const panel = () => document.querySelector('[role="dialog"][aria-label="Ask about this"]')

/** Press something in the list. It leaves on its animation's end, which
 *  jsdom never plays, so the end is said for it. */
async function inDrawer(button: HTMLButtonElement | undefined) {
  expect(button).toBeDefined()
  await act(async () => button!.click())
  await act(async () => {
    drawer()!.dispatchEvent(new Event('animationend', { bubbles: true }))
  })
}

async function ask(detail: object) {
  await act(async () => {
    window.dispatchEvent(new CustomEvent('didactic:ask', { detail }))
  })
}

describe('AskButton', () => {
  it('opens the list alone, and moves the sheet over for it', async () => {
    await ask({ shelf: true })
    expect(drawer()).not.toBeNull()
    expect(panel()).toBeNull()
    expect(document.body.dataset.notes).toBe('open')
  })

  it('opens the panel alone for a new question', async () => {
    await ask({})
    expect(panel()).not.toBeNull()
    expect(drawer()).toBeNull()
  })

  it('opens the panel on a conversation picked from the list', async () => {
    await ask({ shelf: true })
    await inDrawer(
      [...drawer()!.querySelectorAll('button')].find(b =>
        b.textContent?.includes('Why a longer lens?')
      )
    )
    // The list hands over and goes, taking the room it made with it.
    expect(drawer()).toBeNull()
    expect(document.body.dataset.notes).toBeUndefined()
    expect(read).toHaveBeenCalledWith('c1')
    expect(panel()?.textContent).toContain('Why a longer lens?')
  })

  it('opens the panel on a new question from the list', async () => {
    await ask({ shelf: true })
    await inDrawer(
      [...drawer()!.querySelectorAll('button')].find(b => b.textContent === 'New question')
    )
    expect(drawer()).toBeNull()
    expect(panel()).not.toBeNull()
    expect(read).not.toHaveBeenCalled()
  })
})
