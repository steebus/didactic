import { describe, it, expect, vi, afterEach } from 'vitest'
import { settlePictures } from '../src/lib/pictures'

/**
 * Settling a lesson's pictures.
 *
 * The parsing and rewriting are `core/pictures` and tested there. What
 * is tested here is the part that talks to the world, because it is the
 * part that *removes* something a reader would otherwise have seen, and
 * a resolver that drops a picture it should have kept is a worse bug
 * than the broken link it was written to fix.
 */

const block = (url: string) =>
  `Before.\n\n\`\`\`picture\n${JSON.stringify({ url, alt: 'A diagram of a thing' })}\n\`\`\`\n\nAfter.`

/** What Commons answers with, in the shape `formatversion=2` gives. */
function commons(found: Record<string, string>) {
  return (titles: string) => ({
    ok: true,
    json: async () => ({
      query: {
        pages: titles.split('|').map(title => {
          const name = title.replace(/^File:/, '')
          const at = found[name]
          return at
            ? { title, imageinfo: [{ url: at }] }
            : { title, missing: true }
        }),
      },
    }),
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('settlePictures', () => {
  /* The case this was written for: the name was right, the extension
     was right, and the MD5 shard in the path was invented. */
  it('puts a guessed Wikimedia path right', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      const titles = new URL(url).searchParams.get('titles')!
      return commons({
        'NCDN_-_CDN.png': 'https://upload.wikimedia.org/wikipedia/commons/f/f9/NCDN_-_CDN.png',
      })(titles)
    })

    const out = await settlePictures(
      block('https://upload.wikimedia.org/wikipedia/commons/3/3f/NCDN_-_CDN.png')
    )
    expect(out.text).toContain('f/f9/NCDN_-_CDN.png')
    expect(out.text).not.toContain('3/3f')
    expect(out.fixed).toBe(1)
    expect(out.dropped).toBe(0)
  })

  it('falls back to another extension when the written one does not exist', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      const titles = new URL(url).searchParams.get('titles')!
      return commons({
        'Thing.svg': 'https://upload.wikimedia.org/wikipedia/commons/1/12/Thing.svg',
      })(titles)
    })

    const out = await settlePictures(
      block('https://upload.wikimedia.org/wikipedia/commons/3/3f/Thing.png')
    )
    expect(out.text).toContain('Thing.svg')
    expect(out.fixed).toBe(1)
  })

  it('keeps the written extension when both exist', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      const titles = new URL(url).searchParams.get('titles')!
      return commons({
        'Thing.png': 'https://upload.wikimedia.org/wikipedia/commons/a/aa/Thing.png',
        'Thing.svg': 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Thing.svg',
      })(titles)
    })

    const out = await settlePictures(
      block('https://commons.wikimedia.org/wiki/File:Thing.png')
    )
    expect(out.text).toContain('a/aa/Thing.png')
  })

  it('strips the campaign tags Commons hangs off the address', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      const titles = new URL(url).searchParams.get('titles')!
      return commons({
        'Thing.svg':
          'https://upload.wikimedia.org/wikipedia/commons/1/12/Thing.svg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo',
      })(titles)
    })

    const out = await settlePictures(block('https://commons.wikimedia.org/wiki/File:Thing.svg'))
    expect(out.text).toContain('1/12/Thing.svg')
    expect(out.text).not.toContain('utm_')
  })

  it('takes out a Wikimedia picture that does not exist under any name', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      const titles = new URL(url).searchParams.get('titles')!
      return commons({})(titles)
    })

    const out = await settlePictures(
      block('https://upload.wikimedia.org/wikipedia/commons/3/3f/Invented.png')
    )
    expect(out.text).not.toContain('picture')
    expect(out.text).toContain('Before.')
    expect(out.text).toContain('After.')
    expect(out.dropped).toBe(1)
  })

  it('keeps a picture elsewhere that answers', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/png' }),
    }))

    const out = await settlePictures(block('https://example.com/real.png'))
    expect(out.text).toContain('https://example.com/real.png')
    expect(out.dropped).toBe(0)
  })

  it('takes out a picture elsewhere that does not', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 404,
      headers: new Headers(),
    }))

    const out = await settlePictures(block('https://example.com/gone.png'))
    expect(out.dropped).toBe(1)
  })

  /* A "not found" dressed up as a page is not a picture. */
  it('takes out a picture whose host answers with HTML', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/html' }),
    }))

    const out = await settlePictures(block('https://example.com/oops.png'))
    expect(out.dropped).toBe(1)
  })

  it('asks nothing at all of a lesson with no pictures', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    const body = 'Just prose.\n\n```check\n{"question":"Q"}\n```'
    const out = await settlePictures(body)
    expect(out.text).toBe(body)
    expect(fetch).not.toHaveBeenCalled()
  })

  /* Commons being down is not a reason to fail a lesson, but it is also
     not a reason to ship an address nobody checked. */
  it('drops the picture rather than throwing when the lookup fails', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('network')
    })

    const out = await settlePictures(
      block('https://commons.wikimedia.org/wiki/File:Thing.svg')
    )
    expect(out.dropped).toBe(1)
    expect(out.text).toContain('Before.')
  })
})
