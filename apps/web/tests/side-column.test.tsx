// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useSideColumn } from '@/components/useSideColumn'

/**
 * One column beside the reading at a time: the marks' list, the
 * questions asked here, a note opened out. Opening one asks the others
 * to go, and the sheet keeps the room it made across the handover
 * rather than snapping back as the first shuts.
 */

let container: HTMLDivElement
let root: Root
const setters: Record<string, (open: boolean) => void> = {}

function Column({ name }: { name: string }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    setters[name] = setOpen
  }, [name])
  useSideColumn(open, name, () => setOpen(false))
  return open ? <aside data-column={name} /> : null
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() =>
    root.render(
      <>
        <Column name="marks" />
        <Column name="asks" />
      </>
    )
  )
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const shown = () =>
  [...document.querySelectorAll('[data-column]')].map(e => e.getAttribute('data-column'))

describe('useSideColumn', () => {
  it('makes room while a column is out, and gives it back when it shuts', () => {
    act(() => setters.marks(true))
    expect(document.body.dataset.notes).toBe('open')
    act(() => setters.marks(false))
    expect(document.body.dataset.notes).toBeUndefined()
  })

  it('shuts the column that was out when another opens', () => {
    act(() => setters.marks(true))
    act(() => setters.asks(true))
    expect(shown()).toEqual(['asks'])
    // The room stays made for the one that took the strip.
    expect(document.body.dataset.notes).toBe('open')
  })

  it('works the other way round', () => {
    act(() => setters.asks(true))
    act(() => setters.marks(true))
    expect(shown()).toEqual(['marks'])
    expect(document.body.dataset.notes).toBe('open')
    act(() => setters.marks(false))
    expect(document.body.dataset.notes).toBeUndefined()
  })
})
