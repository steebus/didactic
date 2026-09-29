import { describe, it, expect } from 'vitest'
import { cleanSharedUrl, kindLabel, mediaOf, sharedLink } from '../src/shared'

describe('a shared link, cleaned', () => {
  it('spells a YouTube video one way whatever form it came in', () => {
    const watch = 'https://www.youtube.com/watch?v=aircAruvnKk'
    expect(cleanSharedUrl('https://youtu.be/aircAruvnKk?si=abc123')).toBe(watch)
    expect(cleanSharedUrl('https://m.youtube.com/watch?v=aircAruvnKk&t=30s&feature=share')).toBe(watch)
    expect(cleanSharedUrl('https://www.youtube.com/shorts/aircAruvnKk')).toBe(watch)
    expect(cleanSharedUrl('https://youtube.com/live/aircAruvnKk?si=x')).toBe(watch)
  })

  it('spells an Instagram post or reel as its /p/ address', () => {
    expect(cleanSharedUrl('https://www.instagram.com/reel/Dd0Sqf5F3AK/?igsh=MWx0')).toBe(
      'https://www.instagram.com/p/Dd0Sqf5F3AK/'
    )
    expect(cleanSharedUrl('https://instagram.com/natgeo/p/Dd0Sqf5F3AK')).toBe(
      'https://www.instagram.com/p/Dd0Sqf5F3AK/'
    )
  })

  it('takes Substack’s referral marks off, on Substack only', () => {
    expect(
      cleanSharedUrl('https://someone.substack.com/p/a-post?r=2abc&utm_campaign=post&utm_medium=web')
    ).toBe('https://someone.substack.com/p/a-post')
    expect(cleanSharedUrl('https://example.com/search?r=2&q=x')).toBe('https://example.com/search?r=2&q=x')
  })

  it('leaves a query that says what the page is alone', () => {
    expect(cleanSharedUrl('https://example.com/?p=123&utm_source=x#top')).toBe('https://example.com/?p=123')
  })
})

describe('what a link is played as', () => {
  it('embeds a video without the tracking cookie', () => {
    expect(mediaOf('https://youtu.be/aircAruvnKk')).toEqual({
      kind: 'youtube',
      id: 'aircAruvnKk',
      embed: 'https://www.youtube-nocookie.com/embed/aircAruvnKk',
    })
  })

  it('embeds a post with its caption', () => {
    expect(mediaOf('https://www.instagram.com/p/Dd0Sqf5F3AK/')?.embed).toBe(
      'https://www.instagram.com/p/Dd0Sqf5F3AK/embed/captioned/'
    )
  })

  it('is nothing for a page, a channel or a profile', () => {
    expect(mediaOf('https://example.com/watch?v=aircAruvnKk')).toBeNull()
    expect(mediaOf('https://www.youtube.com/@3blue1brown')).toBeNull()
    expect(mediaOf('https://www.instagram.com/natgeo/')).toBeNull()
    expect(mediaOf(null)).toBeNull()
  })

  it('names a video a video', () => {
    expect(kindLabel('article', 'https://youtu.be/aircAruvnKk')).toBe('Video')
    expect(kindLabel('article', 'https://www.instagram.com/p/Dd0Sqf5F3AK/')).toBe('Post')
    expect(kindLabel('article', 'https://example.com')).toBe('Article')
    expect(kindLabel('pdf')).toBe('Document')
  })
})

describe('what a share handed over', () => {
  it('finds the link in the text, where Android puts it', () => {
    expect(
      sharedLink({ text: 'But what is a neural network? https://youtu.be/aircAruvnKk?si=q' })
    ).toEqual({
      url: 'https://www.youtube.com/watch?v=aircAruvnKk',
      title: 'But what is a neural network?',
      note: null,
    })
  })

  it('prefers the url given, and keeps a title that is words', () => {
    expect(sharedLink({ url: 'https://example.com/a', title: 'A piece', text: 'https://example.com/a' })).toEqual({
      url: 'https://example.com/a',
      title: 'A piece',
      note: null,
    })
  })

  it('drops a title that is only the address again', () => {
    expect(sharedLink({ url: 'https://example.com/a', title: 'https://example.com/a' }).title).toBeNull()
  })

  it('does not take the sentence’s full stop into the link', () => {
    expect(sharedLink({ text: 'Read this: https://example.com/a.' }).url).toBe('https://example.com/a')
  })

  it('makes words with no link a note', () => {
    expect(sharedLink({ text: 'Compounding is interest on interest.' })).toEqual({
      url: null,
      title: null,
      note: 'Compounding is interest on interest.',
    })
  })

  it('keeps a long passage shared with a link as a note rather than a title', () => {
    const long = 'x '.repeat(100).trim()
    const shared = sharedLink({ url: 'https://example.com/a', text: long })
    expect(shared.title).toBeNull()
    expect(shared.note).toBe(long)
  })
})
