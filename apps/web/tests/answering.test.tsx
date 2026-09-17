// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * What a question says it was worth.
 *
 * The figures were never in doubt: the unique index on (user, lesson,
 * question) is what decides whether an answer counts, and it decided
 * correctly throughout. What was wrong was the sentence printed under
 * the question -- every first answer to every question was met with
 * "you have answered this one before", which is the opposite of what
 * had just happened. So these are tests of the wording, which is the
 * part a reader actually sees.
 */
const answer = vi.fn()
vi.mock('@didactic/api', () => ({
  didactic: () => ({ lessons: { answer } }),
}))

const { Answering } = await import('@/components/blocks/answering')
const { Check } = await import('@/components/blocks/Check')

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  answer.mockReset()
  answer.mockResolvedValue({ ok: true, body: { counted: true, exposureWritten: true } })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const QUESTION = {
  question: 'Server and client disagree on a timestamp. What happens?',
  options: [
    { text: 'Nothing at all' },
    { text: 'A hydration mismatch', correct: true },
  ],
}

/** Draw the question, with whatever the server says has been answered. */
function show(answered: Record<string, boolean> = {}) {
  act(() => {
    root.render(
      <Answering lessonId="lesson-1" answered={answered}>
        <Check data={QUESTION} />
      </Answering>
    )
  })
}

const option = (text: string) =>
  Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes(text))!

const press = (text: string) =>
  act(() => {
    option(text).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })

/** The wording that must only ever appear for a genuine repeat. */
const REPEAT = /answered this one before/

describe('answering a question for the first time', () => {
  it('is not told it has been answered before', async () => {
    show()
    press('A hydration mismatch')
    await act(async () => {})

    expect(container.textContent).not.toMatch(REPEAT)
    expect(container.textContent).toContain('Entered in the ledger')
    expect(answer).toHaveBeenCalledOnce()
  })

  it('is not told so on a wrong answer either', async () => {
    answer.mockResolvedValue({ ok: true, body: { counted: true, exposureWritten: false } })
    show()
    press('Nothing at all')
    await act(async () => {})

    expect(container.textContent).not.toMatch(REPEAT)
    expect(container.textContent).toContain('a wrong answer never subtracts')
  })
})

describe('answering one that was answered before', () => {
  it('says so, and does not send it again', async () => {
    // The key the server keeps is the question's, hashed the same way
    // the block hashes it -- so the map is built through the same
    // function rather than with a literal that could drift from it.
    const { questionKey } = await import('@didactic/core/answers')
    show({ [questionKey(QUESTION.question)]: true })
    press('A hydration mismatch')
    await act(async () => {})

    expect(container.textContent).toMatch(REPEAT)
    expect(answer).not.toHaveBeenCalled()
  })

  it('says so on a second answer in the same sitting, having counted the first', async () => {
    show()
    press('A hydration mismatch')
    await act(async () => {})
    expect(container.textContent).not.toMatch(REPEAT)

    // "Ask again" reopens the question. The answer is already entered,
    // so this one is worth nothing and must say so.
    press('Ask again')
    press('A hydration mismatch')
    await act(async () => {})

    expect(container.textContent).toMatch(REPEAT)
    // Still only the first one went to the server.
    expect(answer).toHaveBeenCalledOnce()
  })
})
