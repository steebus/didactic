// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Bench, useBench, type Outcome, type Made } from '@/components/Bench'

/**
 * The potting bench, and the one thing about it that is not obvious.
 *
 * A job is keyed so the same piece of work cannot be started twice --
 * two model calls, two charges, and whichever lands last overwriting
 * the other. That works while a job knows at the outset what it is
 * going to do, and opening a freshly sown bed does not: it drafts a
 * route and then writes a lesson that did not exist when it started, so
 * `writing:<that lesson>` cannot be its key. What is tested here is the
 * claim that closes the gap.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))

let container: HTMLElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

/** A handle on the bench from outside React, so a test can drive it. */
type Handle = ReturnType<typeof useBench>

function render(): Handle {
  let held: Handle | null = null
  function Probe() {
    held = useBench()
    return null
  }
  act(() => {
    root.render(
      <Bench>
        <Probe />
      </Bench>
    )
  })
  return held!
}

/** A promise a test can settle by hand, so a job can be held open. */
function held<T>() {
  let settle!: (v: T) => void
  let fail!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    settle = res
    fail = rej
  })
  return { promise, settle, fail }
}

describe('work a job takes over part way through', () => {
  it('is joined rather than started a second time', async () => {
    const bench = render()
    const lesson = held<Made>()
    const second = vi.fn()

    let outcome!: Promise<Outcome<Made>>
    act(() => {
      outcome = bench.start(
        { kind: 'opening', id: 'top-1', name: 'Exposure' },
        async (_report, cover) => {
          cover('writing', 'les-1')
          return lesson.promise
        }
      )
    })

    // The lesson's own sheet, opened while the body is being written.
    const joined = await bench.start(
      { kind: 'writing', id: 'les-1', name: 'What exposure is' },
      async () => {
        second()
        return {}
      }
    )

    expect(joined).toEqual({ kind: 'joined' })
    expect(second).not.toHaveBeenCalled()

    await act(async () => {
      lesson.settle({ href: '/lesson/les-1' })
      await outcome
    })
  })

  it('is answered for by the job that has it in hand', async () => {
    // The lesson sheet asks whether *this lesson* is being written, and
    // "yes, by the job opening the bed it belongs to" is the true
    // answer -- it is what tells the sheet to wait and then re-read.
    const bench = render()
    const lesson = held<Made>()

    let outcome!: Promise<Outcome<Made>>
    act(() => {
      outcome = bench.start(
        { kind: 'opening', id: 'top-1', name: 'Exposure' },
        async (_report, cover) => {
          cover('writing', 'les-1')
          return lesson.promise
        }
      )
    })

    const running = render()
    expect(running.jobFor('writing', 'les-1')?.kind).toBe('opening')
    expect(running.running('writing', 'les-1')).toBe(true)

    await act(async () => {
      lesson.settle({ href: '/lesson/les-1' })
      await outcome
    })

    const done = render()
    expect(done.jobFor('writing', 'les-1')?.state).toBe('done')
  })

  it('is given back when the job settles, so it can be asked for again', async () => {
    const bench = render()
    const lesson = held<Made>()

    let outcome!: Promise<Outcome<Made>>
    act(() => {
      outcome = bench.start(
        { kind: 'opening', id: 'top-1', name: 'Exposure' },
        async (_report, cover) => {
          cover('writing', 'les-1')
          return lesson.promise
        }
      )
    })

    await act(async () => {
      lesson.fail(new Error('The model was busy.'))
      await outcome
    })

    // The opening failed, so the lesson was never written. Asking for
    // it again has to do something.
    const wrote = vi.fn()
    const again = await bench.start(
      { kind: 'writing', id: 'les-1', name: 'What exposure is' },
      async () => {
        wrote()
        return {}
      }
    )

    expect(again.kind).toBe('done')
    expect(wrote).toHaveBeenCalledOnce()
  })

  it('never takes work that is already underway', async () => {
    // Two jobs both believing they own one key is worse than one job
    // not knowing it has company.
    const bench = render()
    const first = held<Made>()
    const opening = held<Made>()

    let writing!: Promise<Outcome<Made>>
    act(() => {
      writing = bench.start(
        { kind: 'writing', id: 'les-1', name: 'What exposure is' },
        async () => first.promise
      )
    })

    let outcome!: Promise<Outcome<Made>>
    act(() => {
      outcome = bench.start(
        { kind: 'opening', id: 'top-1', name: 'Exposure' },
        async (_report, cover) => {
          cover('writing', 'les-1')
          return opening.promise
        }
      )
    })

    // The write stands as its own job, not as something the opening
    // took over.
    const now = render()
    expect(now.jobFor('writing', 'les-1')?.kind).toBe('writing')

    await act(async () => {
      first.settle({})
      opening.settle({})
      await Promise.all([writing, outcome])
    })
  })
})
