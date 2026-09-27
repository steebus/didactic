import { describe, it, expect } from 'vitest'
import { isPlaceholderTitle, urlTitle, URL_TITLE_MAX } from '../src/titles'

const EMERSON = 'https://archive.vcu.edu/english/engweb/transcendentalism/authors/emerson/essays/selfreliance.html'

describe('urlTitle', () => {
  it('shortens a long address to its site and its page', () => {
    expect(urlTitle(EMERSON)).toBe('archive.vcu.edu/…/selfreliance.html')
  })

  it('keeps a short address whole, without its scheme, www, query or trailing slash', () => {
    expect(urlTitle('https://www.paulgraham.com/cornpone.html?ref=x#top')).toBe('paulgraham.com/cornpone.html')
    expect(urlTitle('http://example.com/')).toBe('example.com')
  })

  it('never runs past its limit, however long the last segment', () => {
    const long = `https://example.com/a/${'x'.repeat(120)}`
    expect(urlTitle(long).length).toBe(URL_TITLE_MAX)
    expect(urlTitle(long).endsWith('…')).toBe(true)
    expect(urlTitle(`https://${'sub.'.repeat(30)}example.com`).length).toBe(URL_TITLE_MAX)
  })
})

describe('isPlaceholderTitle', () => {
  it('knows the raw address and the stand-in for it', () => {
    expect(isPlaceholderTitle(EMERSON, EMERSON)).toBe(true)
    expect(isPlaceholderTitle(urlTitle(EMERSON), EMERSON)).toBe(true)
    expect(isPlaceholderTitle('', EMERSON)).toBe(true)
  })

  it('never takes a real title for one', () => {
    expect(isPlaceholderTitle('Self-Reliance', EMERSON)).toBe(false)
    expect(isPlaceholderTitle('Archive of American essays', EMERSON)).toBe(false)
  })

  it('has nothing to say about a resource with no address', () => {
    expect(isPlaceholderTitle('Untitled PDF', null)).toBe(false)
  })
})
