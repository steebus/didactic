import { describe, it, expect } from 'vitest'
import { commonsName, nameVariants, readPictures, rewritePictures } from '../src/pictures'

describe('commonsName', () => {
  it('reads the hashed upload path the model invents', () => {
    expect(commonsName('https://upload.wikimedia.org/wikipedia/commons/3/3f/NCDN_-_CDN.png'))
      .toBe('NCDN_-_CDN.png')
  })

  it('reads a thumbnail back to the file it was made from', () => {
    expect(
      commonsName(
        'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/NCDN_-_CDN.svg/800px-NCDN_-_CDN.svg.png'
      )
    ).toBe('NCDN_-_CDN.svg')
  })

  it('reads a Commons file page', () => {
    expect(commonsName('https://commons.wikimedia.org/wiki/File:NCDN_-_CDN.svg'))
      .toBe('NCDN_-_CDN.svg')
  })

  /* What a person actually pastes: the address you get from pressing the
     picture in an article. */
  it('reads the media fragment off an article', () => {
    expect(
      commonsName(
        'https://en.wikipedia.org/wiki/Content_delivery_network#/media/File:NCDN_-_CDN.svg'
      )
    ).toBe('NCDN_-_CDN.svg')
  })

  it('puts spaces back as the underscores Commons writes', () => {
    expect(commonsName('https://commons.wikimedia.org/wiki/File:Bean seed diagram.svg'))
      .toBe('Bean_seed_diagram.svg')
  })

  it('decodes an escaped name', () => {
    expect(commonsName('https://commons.wikimedia.org/wiki/File:Caf%C3%A9_wall.svg'))
      .toBe('Café_wall.svg')
  })

  it('says nothing about an address that is not Wikimedia', () => {
    expect(commonsName('https://example.com/a/b/diagram.png')).toBeNull()
    expect(commonsName('https://notwikipedia.org.evil.com/wiki/File:X.svg')).toBeNull()
  })

  it('says nothing about nothing', () => {
    expect(commonsName(undefined)).toBeNull()
    expect(commonsName('')).toBeNull()
    expect(commonsName('not a url')).toBeNull()
  })
})

describe('nameVariants', () => {
  it('tries what was written first', () => {
    expect(nameVariants('A.png')[0]).toBe('A.png')
  })

  /* The case that started this: the name was right and the extension
     was not. */
  it('offers the other extensions after it', () => {
    const tries = nameVariants('NCDN_-_CDN.png')
    expect(tries).toContain('NCDN_-_CDN.svg')
    expect(tries.indexOf('NCDN_-_CDN.svg')).toBeGreaterThan(0)
  })

  it('does not offer the written extension twice', () => {
    const tries = nameVariants('A.svg')
    expect(tries.filter(t => t === 'A.svg')).toHaveLength(1)
  })

  it('leaves a name with no extension alone', () => {
    expect(nameVariants('Plain')).toEqual(['Plain'])
  })
})

const body = `Some prose.

\`\`\`picture
{"url":"https://upload.wikimedia.org/wikipedia/commons/3/3f/A.png","alt":"A thing","caption":"Why"}
\`\`\`

More prose.

\`\`\`check
{"question":"Q","options":[]}
\`\`\`

\`\`\`picture
{"url":"https://example.com/b.png","alt":"Another"}
\`\`\`

The end.`

describe('readPictures', () => {
  it('finds every picture, in order, and nothing else', () => {
    const found = readPictures(body)
    expect(found).toHaveLength(2)
    expect(found[0].alt).toBe('A thing')
    expect(found[1].url).toBe('https://example.com/b.png')
    expect(found.map(p => p.index)).toEqual([0, 1])
  })

  it('finds none in a body with none', () => {
    expect(readPictures('Just prose.')).toEqual([])
  })
})

describe('rewritePictures', () => {
  it('puts the settled address on the block', () => {
    const { text, fixed } = rewritePictures(body, b =>
      b.index === 0 ? 'https://upload.wikimedia.org/wikipedia/commons/9/99/A.svg' : b.url ?? null
    )
    expect(text).toContain('9/99/A.svg')
    expect(fixed).toBe(1)
  })

  it('takes out a picture that could not be found', () => {
    const { text, dropped } = rewritePictures(body, b => (b.index === 1 ? null : b.url ?? null))
    expect(text).not.toContain('example.com/b.png')
    expect(text).toContain('A thing')
    expect(dropped).toBe(1)
  })

  it('leaves the prose and the other blocks exactly as they were', () => {
    const { text } = rewritePictures(body, b => b.url ?? null)
    expect(text).toContain('Some prose.')
    expect(text).toContain('More prose.')
    expect(text).toContain('The end.')
    expect(text).toContain('"question": "Q"')
  })

  it('counts nothing as fixed when nothing moved', () => {
    const { fixed, dropped } = rewritePictures(body, b => b.url ?? null)
    expect(fixed).toBe(0)
    expect(dropped).toBe(0)
  })

  it('leaves a body with no pictures byte for byte', () => {
    const plain = 'Just prose.\n\nAnd more.'
    expect(rewritePictures(plain, () => null).text).toBe(plain)
  })

  it('does not leave a hole where a picture was', () => {
    const { text } = rewritePictures(body, () => null)
    expect(text).not.toMatch(/\n{3,}/)
  })
})
