// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { VoicingStanding } from '@didactic/core/voicing'

/**
 * What the circle against a lesson says.
 *
 * The rule behind it is tested in `core/voicing`; this is a test of the
 * drawing, because the complaint was about the drawing. A route of
 * sixteen lessons printed sixteen identical grey circles whether or not
 * any of them had audio behind it -- the only difference between "no
 * recording" and "recorded and ready" was `--ink-soft` against `--ink`,
 * which is not a difference anybody reads down a list.
 *
 * So what is asserted is that the states are *distinguishable*: the
 * offer carried on the element for the stylesheet to key off, the ring
 * drawn or not drawn, and the label a screen reader gets, which is the
 * same fact in words.
 */

const { ListenButton } = await import('@/components/ListenButton')

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const standing = (over: Partial<VoicingStanding>): VoicingStanding => ({
  state: 'none',
  done: 0,
  total: null,
  ...over,
})

function draw(props: {
  standing?: VoicingStanding
  playing?: boolean
  onPress?: () => void
}) {
  act(() => {
    root.render(
      <ListenButton
        standing={props.standing}
        playing={props.playing ?? false}
        title="Field Data"
        onPress={props.onPress ?? (() => {})}
      />
    )
  })
  return container.querySelector('button')!
}

/** The arc that says how much has been made, if it is drawn at all. */
function arc(button: HTMLButtonElement): SVGCircleElement | null {
  return button.querySelector('circle[stroke-dasharray][transform]')
}

describe('the circle against a lesson', () => {
  it('offers to make a recording where there is none', () => {
    const button = draw({ standing: standing({}) })
    expect(button.dataset.offer).toBe('make')
    expect(button.getAttribute('aria-label')).toBe('Read Field Data aloud')
  })

  it('reads as an offer for a lesson nothing is known about yet', () => {
    // The first render of the sheet, before the standing has landed.
    expect(draw({}).dataset.offer).toBe('make')
  })

  it('says it is waiting while it is queued with nothing made', () => {
    const button = draw({ standing: standing({ state: 'queued' }) })
    expect(button.dataset.offer).toBe('waiting')
    expect(arc(button)).toBeNull()
  })

  it('draws how far through it is once pieces exist', () => {
    const button = draw({ standing: standing({ state: 'voicing', done: 3, total: 12 }) })
    expect(button.dataset.offer).toBe('making')

    const ring = arc(button)
    expect(ring).not.toBeNull()
    // A quarter made is three quarters of the circumference still to
    // be uncovered.
    const round = Number(ring!.getAttribute('stroke-dasharray'))
    expect(Number(ring!.getAttribute('stroke-dashoffset'))).toBeCloseTo(round * 0.75, 5)
  })

  it('says how far through in words as well as in the ring', () => {
    const button = draw({ standing: standing({ state: 'voicing', done: 3, total: 12 }) })
    expect(button.getAttribute('aria-label')).toContain('3 of 12 pieces')
  })

  it('is a different state from an offer once the recording is whole', () => {
    // The regression this exists for: ready and none were the same
    // circle, and the only way to find out was to press it.
    const made = draw({ standing: standing({ state: 'ready', done: 12, total: 12 }) })
    expect(made.dataset.offer).toBe('play')
    expect(made.getAttribute('aria-label')).toBe('Listen to Field Data')

    act(() => root.render(<div />))
    const none = draw({ standing: standing({}) })
    expect(none.dataset.offer).not.toBe(made.dataset.offer)
  })

  it('stops drawing the arc once the ring is closed', () => {
    // The rim carries the state in its own colour from here; a second
    // full circle over it would only fight with it.
    expect(arc(draw({ standing: standing({ state: 'ready', done: 12, total: 12 }) }))).toBeNull()
  })

  it('offers the retry after a failure, and says so', () => {
    const button = draw({ standing: standing({ state: 'failed', done: 2, total: 12 }) })
    expect(button.dataset.offer).toBe('again')
    expect(button.getAttribute('aria-label')).toBe(
      'Reading Field Data aloud failed — try again'
    )
  })

  it('becomes pause for the lesson the player is running', () => {
    const button = draw({
      standing: standing({ state: 'ready', done: 9, total: 9 }),
      playing: true,
    })
    expect(button.dataset.offer).toBe('pause')
    expect(button.getAttribute('aria-label')).toBe('Pause Field Data')
  })

  it('is pause even for a lesson still being made, which can be played', () => {
    const button = draw({
      standing: standing({ state: 'voicing', done: 2, total: 12 }),
      playing: true,
    })
    expect(button.dataset.offer).toBe('pause')
  })

  it('is pressable in every state', () => {
    // Including while it is being made: the pieces that exist can be
    // listened to, and a control that is visibly working but does
    // nothing when pressed is the worst kind.
    const press = vi.fn()
    for (const s of [
      standing({}),
      standing({ state: 'queued' }),
      standing({ state: 'voicing', done: 2, total: 12 }),
      standing({ state: 'ready', done: 12, total: 12 }),
      standing({ state: 'failed' }),
    ]) {
      const button = draw({ standing: s, onPress: press })
      expect(button.disabled).toBe(false)
      act(() => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
    }
    expect(press).toHaveBeenCalledTimes(5)
  })
})
