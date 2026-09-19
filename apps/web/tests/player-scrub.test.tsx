// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * Dragging the bar at the foot of the sheet.
 *
 * The maths under it is tested in `core/voicing`; what is tested here
 * is the part that only exists in the component, and it is the part
 * that would be wrong if it were written the obvious way: a drag is not
 * a seek. A bar that sought on every pixel would load a new file each
 * time the thumb crossed a piece, so the thumb moves freely and letting
 * go is what asks for anything.
 *
 * The other half is the arrival. A lesson is a dozen files, so a seek
 * into a piece that is not loaded cannot set `currentTime` at the
 * moment it is asked for -- the element has no duration yet, and a
 * write before the metadata lands is silently thrown away.
 */

const CHUNKS = [
  { idx: 0, seconds: 30, text: 'One.', path: 'a/0.mp3', url: 'blob:0' },
  { idx: 1, seconds: 45, text: 'Two.', path: 'a/1.mp3', url: 'blob:1' },
  { idx: 2, seconds: 20, text: 'Three.', path: 'a/2.mp3', url: 'blob:2' },
]

const voicing = vi.fn(async () => ({
  ok: true as const,
  body: { state: 'ready', title: 'Field Data', total: 3, chunks: CHUNKS },
}))

vi.mock('@didactic/api', () => ({ didactic: () => ({ lessons: { voicing, listen: vi.fn() } }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))
vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))
vi.mock('@/components/Bench', () => ({
  useBench: () => ({ start: vi.fn(), running: () => false }),
}))

const { Player, usePlayer } = await import('@/components/Player')

type Handle = ReturnType<typeof usePlayer>

let container: HTMLElement
let root: Root

beforeEach(() => {
  // jsdom has no media pipeline: `play` rejects and `load` is absent,
  // and neither is what is under test here.
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: () => Promise.resolve(),
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

/** Mount the bar with a lesson loaded and playing from its first piece. */
async function open() {
  let held: Handle | null = null
  function Probe() {
    held = usePlayer()
    return null
  }

  await act(async () => {
    root.render(
      <Player>
        <Probe />
      </Player>
    )
  })
  const player = held! as Handle
  await act(async () => {
    await player.listen({ id: 'lesson-1', title: 'Field Data' })
  })
}

const seek = () => container.querySelector<HTMLInputElement>('input[type="range"]')!
const where = () => container.querySelector('p')!.textContent
const media = () => container.querySelector('audio')!

/** Move the thumb the way a pointer drag does: input events, no release. */
function drag(to: number) {
  act(() => {
    const el = seek()
    // React tracks the last value it set, so a controlled range needs
    // the setter called directly for the event to be seen as a change.
    Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )!.set!.call(el, String(to))
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function release() {
  act(() => {
    seek().dispatchEvent(new Event('pointerup', { bubbles: true }))
  })
}

describe('the bar at the foot of the sheet', () => {
  it('offers a scrubber across the whole lesson, not the piece playing', async () => {
    await open()
    // Three pieces of 30, 45 and 20 seconds are one recording of 95.
    expect(seek().max).toBe('95')
    expect(where()).toBe('0:00 of 1:35')
  })

  it('follows the thumb while it is being dragged', async () => {
    await open()
    drag(50)
    expect(where()).toBe('0:50 of 1:35')
    expect(seek().value).toBe('50')
  })

  it('does not seek until the drag is let go', async () => {
    await open()
    drag(50)
    // Still on the first piece: a drag that sought as it went would
    // have loaded the second file somewhere around 0:30.
    expect(media().getAttribute('src')).toBe('blob:0')
  })

  it('loads the piece the thumb was let go over', async () => {
    await open()
    drag(50)
    release()
    expect(media().getAttribute('src')).toBe('blob:1')
  })

  it('starts that piece where the drag pointed, once it has a duration', async () => {
    await open()
    drag(50)
    release()

    // 50 seconds into the lesson is 20 seconds into the second piece,
    // and nothing can be set until the file says how long it is.
    expect(media().currentTime).toBe(0)
    act(() => {
      media().dispatchEvent(new Event('loadedmetadata'))
    })
    expect(media().currentTime).toBe(20)
  })

  it('seeks within the piece already loaded without reloading it', async () => {
    await open()
    drag(12)
    release()
    expect(media().getAttribute('src')).toBe('blob:0')
    expect(media().currentTime).toBe(12)
  })

  it('goes back to reporting the audio once the drag is over', async () => {
    await open()
    drag(50)
    release()
    act(() => {
      media().dispatchEvent(new Event('loadedmetadata'))
      media().dispatchEvent(new Event('timeupdate'))
    })
    // 30 seconds of first piece behind it, 20 into this one.
    expect(where()).toBe('0:50 of 1:35')
  })

  it('reads its position as a clock, not as a number of seconds', async () => {
    await open()
    drag(75)
    expect(seek().getAttribute('aria-valuetext')).toBe('1:15 of 1:35')
  })

  it('takes the end of the lesson without running past its last piece', async () => {
    await open()
    drag(95)
    release()
    expect(media().getAttribute('src')).toBe('blob:2')
    act(() => {
      media().dispatchEvent(new Event('loadedmetadata'))
    })
    expect(media().currentTime).toBe(20)
  })
})
