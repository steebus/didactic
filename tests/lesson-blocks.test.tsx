// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Block } from '@/components/blocks/Block'
import { BLOCKS } from '@/lib/blocks'

/**
 * The two blocks added after the first four, drawn from the payloads a
 * model is shown. Every block treats its payload as a suggestion, so
 * what is under test is as much what they do with a broken one.
 */

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const draw = (name: string, data: unknown) =>
  act(() => {
    root.render(<Block name={name} data={data} />)
  })

const example = (name: string) => JSON.parse(BLOCKS.find(b => b.name === name)!.example)

describe('the flow block', () => {
  it('draws the example it teaches the writing agent', () => {
    draw('flow', example('flow'))
    expect(container.textContent).toContain('Which measurement to reach for')
    expect(container.textContent).toContain('Do you know which page?')
    // Both lanes of the parting, each under its own label.
    expect(container.textContent).toContain('Yes')
    expect(container.textContent).toContain('No')
    expect(container.textContent).toContain('Read the field data first')
  })

  it('draws a flow with no parting in it at all', () => {
    draw('flow', { steps: [{ text: 'One' }, { text: 'Two' }] })
    expect(container.textContent).toContain('One')
    expect(container.textContent).toContain('Two')
  })

  it('says where a branch goes rather than drawing a line across the page', () => {
    draw('flow', { steps: [{ text: 'Failed?', goes: 'Start again' }] })
    expect(container.textContent).toContain('Go to')
    expect(container.textContent).toContain('Start again')
  })

  it('draws nothing rather than an empty figure', () => {
    draw('flow', { steps: [] })
    expect(container.textContent).toBe('')
    draw('flow', { steps: [{ detail: 'no text' }] })
    expect(container.textContent).toBe('')
    draw('flow', {})
    expect(container.textContent).toBe('')
  })

  it('ignores a branch with nothing in it', () => {
    draw('flow', { steps: [{ text: 'Ask', branches: [{ label: 'Yes', steps: [] }] }] })
    expect(container.textContent).toContain('Ask')
    expect(container.textContent).not.toContain('Yes')
  })
})

describe('the picture block', () => {
  const picture = () => container.querySelector('img')

  it('points at the picture rather than copying it', () => {
    draw('picture', example('picture'))
    const img = picture()!
    expect(img.getAttribute('src')).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/2/2c/Bean_seed_diagram.svg'
    )
    expect(img.getAttribute('alt')).toContain('bean seed')
    // The host learns that a browser asked, not which page asked.
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(container.textContent).toContain('Wikimedia Commons')
  })

  it('refuses an address that is not https', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:image/svg+xml,<svg onload="alert(1)"/>',
      'http://example.com/a.png',
      'not a url',
    ]) {
      draw('picture', { url, alt: 'Something' })
      expect(picture()).toBeNull()
      expect(container.textContent).toBe('')
    }
  })

  it('refuses a picture nobody reading with their ears can see', () => {
    draw('picture', { url: 'https://example.com/a.png' })
    expect(container.textContent).toBe('')
  })

  it('says what the picture was of when it will not load', () => {
    draw('picture', {
      url: 'https://example.com/gone.png',
      alt: 'A bean seed cut lengthways',
      caption: 'The radicle is the first thing out.',
    })
    act(() => {
      picture()!.dispatchEvent(new Event('error', { bubbles: false }))
    })
    expect(picture()).toBeNull()
    expect(container.textContent).toContain('a bean seed cut lengthways')
    expect(container.textContent).toContain('no longer where the lesson left it')
    // The caption survives the picture, because it says the thing the
    // picture was there to say.
    expect(container.textContent).toContain('The radicle is the first thing out.')
    expect(container.querySelector('a')?.getAttribute('href')).toBe(
      'https://example.com/gone.png'
    )
  })
})
