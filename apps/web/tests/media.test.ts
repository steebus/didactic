import { describe, it, expect } from 'vitest'
import { captionParagraphs, instagramCaption } from '@/lib/extract/media'

describe('captions as paragraphs', () => {
  it('runs lines together and breaks where the speaker paused', () => {
    expect(
      captionParagraphs([
        { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'This is a 3.' }] },
        { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'It is sloppily ' }, { utf8: 'written.' }] },
        { tStartMs: 9000, dDurationMs: 1000, segs: [{ utf8: 'Later on.' }] },
      ])
    ).toEqual(['This is a 3. It is sloppily written.', 'Later on.'])
  })

  it('leaves out the sound cues and the empty lines', () => {
    expect(
      captionParagraphs([
        { tStartMs: 0, dDurationMs: 500, segs: [{ utf8: '[Music]' }] },
        { tStartMs: 500, dDurationMs: 500, segs: [{ utf8: '\n' }] },
        { tStartMs: 1000, dDurationMs: 500, segs: [{ utf8: 'Hello.' }] },
      ])
    ).toEqual(['Hello.'])
  })

  it('breaks a machine’s unpunctuated captions on length alone', () => {
    const line = { dDurationMs: 100, segs: [{ utf8: 'ten words of speech with no full stop in them' }] }
    const events = Array.from({ length: 40 }, (_, i) => ({ ...line, tStartMs: i * 100 }))
    expect(captionParagraphs(events).length).toBeGreaterThan(1)
  })
})

describe('an Instagram caption', () => {
  it('reads the account and the words off the embed', () => {
    const html =
      '<div class="Caption"><a class="CaptionUsername" href="x">natgeo</a><br /><br />' +
      'Photo by <a href="/m/">&#064;marcia</a> | Two sea dragons.<br /><br />Second line &amp; more.' +
      '<div class="CaptionComments"></div>'
    expect(instagramCaption(html)).toEqual({
      author: 'natgeo',
      caption: 'Photo by @marcia | Two sea dragons.\n\nSecond line & more.',
    })
  })

  it('is nothing on a page with no caption', () => {
    expect(instagramCaption('<html></html>')).toEqual({ author: null, caption: null })
  })
})
