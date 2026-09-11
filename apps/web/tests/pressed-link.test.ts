// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { pressedLink } from '@/lib/pressedLink'

const plain = { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, button: 0 }
const nothingSelected = () => ({ isCollapsed: true }) as Selection

function prose(html: string) {
  const article = document.createElement('article')
  article.innerHTML = html
  document.body.replaceChildren(article)
  return article
}

describe('a press in the prose', () => {
  it('hands an inward link to the router rather than the browser', () => {
    const article = prose('<p><a href="/lesson/abc">settles</a></p>')

    expect(pressedLink({ ...plain, target: article.querySelector('a') }, nothingSelected))
      .toBe('/lesson/abc')
  })

  it('is still the link when the press lands on the words inside it', () => {
    const article = prose('<p><a href="/lesson/abc"><strong>settles</strong></a></p>')

    expect(pressedLink({ ...plain, target: article.querySelector('strong') }, nothingSelected))
      .toBe('/lesson/abc')
  })

  it('leaves a link out of the catalogue to the browser', () => {
    const article = prose('<p><a href="https://example.com">a paper</a></p>')

    expect(pressedLink({ ...plain, target: article.querySelector('a') }, nothingSelected))
      .toBeNull()
  })

  it('leaves a stub alone: there is nowhere to go', () => {
    const article = prose('<p><a data-stub title="No lesson for this yet">clearing</a></p>')

    expect(pressedLink({ ...plain, target: article.querySelector('a') }, nothingSelected))
      .toBeNull()
  })

  it('leaves prose that is not a link alone', () => {
    const article = prose('<p>A trade settles later.</p>')

    expect(pressedLink({ ...plain, target: article.querySelector('p') }, nothingSelected))
      .toBeNull()
  })

  it('refuses nothing the reader asked the browser for', () => {
    const article = prose('<p><a href="/lesson/abc">settles</a></p>')
    const target = article.querySelector('a')

    for (const held of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey'] as const) {
      expect(pressedLink({ ...plain, [held]: true, target }, nothingSelected)).toBeNull()
    }
    expect(pressedLink({ ...plain, button: 1, target }, nothingSelected)).toBeNull()
  })

  it('is a passage being kept, not a link, when it ends a selection', () => {
    const article = prose('<p><a href="/lesson/abc">settles</a></p>')
    const dragged = () => ({ isCollapsed: false }) as Selection

    expect(pressedLink({ ...plain, target: article.querySelector('a') }, dragged)).toBeNull()
  })
})
