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

/** Mount the bar with a lesson loaded and playing from its first piece,
 *  handing back the controls a sheet inside it would have. */
async function open(): Promise<Handle> {
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
  return player
}

const seek = () => container.querySelector<HTMLInputElement>('input[type="range"]')!
const bar = () => container.querySelector('[aria-label="Lesson audio"]')
const foldAway = () =>
  container.querySelector<HTMLButtonElement>('[aria-label="Fold the player away"]')
const disc = () =>
  container.querySelector<HTMLButtonElement>('[aria-label^="Show the player"]')
const press = (el: HTMLElement) =>
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
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

describe('folding the player away', () => {
  it('sets no --foot-bar, so nothing at the foot of the sheet moves for it', async () => {
    await open()
    // The bench climbed on this, and the marking desk climbed on the
    // bench -- so pressing Listen re-laid the foot of every sheet, and
    // stopping re-laid it back.
    expect(document.documentElement.style.getPropertyValue('--foot-bar')).toBe('')
    expect(bar()).not.toBeNull()
  })

  it('leaves a disc in the corner in place of the bar', async () => {
    await open()
    press(foldAway()!)
    expect(bar()).toBeNull()
    expect(disc()).not.toBeNull()
  })

  it('keeps the recording running while it is folded', async () => {
    await open()
    const before = media()
    press(foldAway()!)

    // The very same element, not an equivalent one. Re-parenting an
    // `audio` stops it, which on a phone reads as the app cutting out,
    // so folding has to leave it exactly where it was -- which it does
    // by being about the furniture and not about the recording.
    expect(media()).toBe(before)
    expect(media().getAttribute('src')).toBe('blob:0')
    // (jsdom has no media pipeline, so `paused` is not a fact here.)
  })

  it('still reports where it is, around the disc', async () => {
    await open()
    drag(19)
    release()
    press(foldAway()!)
    // 19 of 95 seconds, as a factor for the ring around the disc.
    expect(disc()!.style.getPropertyValue('--played')).toBe('0.2000')
  })

  it('comes back on a press', async () => {
    await open()
    press(foldAway()!)
    press(disc()!)
    expect(bar()).not.toBeNull()
    expect(disc()).toBeNull()
  })

  it('names the lesson it has folded away, for a reader who cannot see it', async () => {
    await open()
    press(foldAway()!)
    expect(disc()!.getAttribute('aria-label')).toBe('Show the player — Field Data')
  })

  it('opens as a bar again for the next lesson', async () => {
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
    press(foldAway()!)
    expect(bar()).toBeNull()

    // A fold is about the recording in hand, not a setting the reader
    // has expressed for every lesson after it.
    await act(async () => {
      await player.listen({ id: 'lesson-2', title: 'Rendering Paths' })
    })
    expect(bar()).not.toBeNull()
  })
})

describe('standing aside for the mark composer', () => {
  it('folds itself when something else takes the foot of the sheet', async () => {
    const player = await open()
    expect(bar()).not.toBeNull()

    // What the Highlighter calls while a panel is docked across the
    // bottom edge: writing about a passage is the foreground job.
    act(() => player.standAside(true))
    expect(bar()).toBeNull()
    expect(disc()).not.toBeNull()
  })

  it('comes back on its own when the composer is done', async () => {
    const player = await open()
    act(() => player.standAside(true))
    act(() => player.standAside(false))
    expect(bar()).not.toBeNull()
    expect(disc()).toBeNull()
  })

  it('does not hand back a bar the reader had already folded', async () => {
    const player = await open()
    press(foldAway()!)

    // A composer opening and closing over a player the reader had put
    // away must leave it put away. The two reasons the bar is down are
    // different facts, and collapsing them loses this one.
    act(() => player.standAside(true))
    act(() => player.standAside(false))
    expect(bar()).toBeNull()
    expect(disc()).not.toBeNull()
  })

  it('keeps the recording running while it stands aside', async () => {
    const player = await open()
    const before = media()
    act(() => player.standAside(true))
    expect(media()).toBe(before)
    expect(media().getAttribute('src')).toBe('blob:0')
  })

  it('publishes no height while it is out of the way', async () => {
    const player = await open()
    // The marking desk reads this to lift clear of the bar. With no bar
    // there is nothing to lift clear of, so the desk stays put.
    act(() => player.standAside(true))
    expect(document.documentElement.style.getPropertyValue('--player-bar')).toBe('')
  })

  it('gives the bar back if the reader presses the disc anyway', async () => {
    const player = await open()
    act(() => player.standAside(true))
    press(disc()!)
    // Their call to make: they asked for the player over the composer.
    expect(bar()).not.toBeNull()
  })
})
