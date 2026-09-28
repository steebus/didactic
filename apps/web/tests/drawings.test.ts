import { describe, it, expect, vi, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { drawingOn, featureOn } from '@/lib/features'
import { drawingPrompt } from '@/lib/llm/drawing'
import { drawPending, DRAWN_CREDIT, DRAWINGS_MAX } from '@/lib/drawings'
import { settlePictures } from '@/lib/pictures'
import { pendingDrawings } from '@didactic/core/pictures'

/**
 * Pictures drawn for a lesson: the switch, the house style, and what a
 * finished lesson's commissions become.
 */

const original = { fetch: globalThis.fetch, env: { ...process.env } }
afterEach(() => {
  globalThis.fetch = original.fetch
  process.env = { ...original.env }
  vi.restoreAllMocks()
})

const commission = (draw: string) =>
  ['```picture', JSON.stringify({ draw, alt: `A drawing of ${draw}`, caption: 'Look.' }), '```'].join('\n')

const lesson = (...draws: string[]) =>
  ['# A lesson', '', 'Prose.', '', ...draws.flatMap(d => [commission(d), '']), 'The end.'].join('\n')

/** A storage client that keeps what it is handed. */
function store(failing = false) {
  const kept: string[] = []
  const bucket = {
    upload: vi.fn(async (path: string) => {
      if (failing) return { error: { message: 'no bucket' } }
      kept.push(path)
      return { error: null }
    }),
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://store.example/${path}` } }),
  }
  const db = { storage: { from: () => bucket } } as unknown as SupabaseClient
  return { db, kept }
}

/** An image model that answers every request with a tiny image. */
function drawer(ok = true) {
  const fn = vi.fn(async () =>
    ok
      ? new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('webp').toString('base64') }] }))
      : new Response('refused', { status: 400 })
  )
  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}

describe('the switch', () => {
  it('is on by default, and off when the deploy says so', () => {
    delete process.env.FEATURE_DRAWN_PICTURES
    expect(featureOn('drawnPictures')).toBe(true)
    process.env.FEATURE_DRAWN_PICTURES = 'off'
    expect(featureOn('drawnPictures')).toBe(false)
    process.env.FEATURE_DRAWN_PICTURES = 'ON'
    expect(featureOn('drawnPictures')).toBe(true)
  })

  it('is off with no key to draw with', () => {
    delete process.env.FEATURE_DRAWN_PICTURES
    delete process.env.OPENAI_API_KEY
    expect(drawingOn()).toBe(false)
    process.env.OPENAI_API_KEY = 'sk-test'
    expect(drawingOn()).toBe(true)
  })
})

describe('drawingPrompt', () => {
  const prompt = drawingPrompt('  A bean seed\n cut lengthways ')

  it('asks for the subject in the catalogue’s hand and palette', () => {
    expect(prompt).toContain('A scientific illustration plate: A bean seed cut lengthways.')
    expect(prompt).toMatch(/botanical engraving/)
    expect(prompt).toContain('#efe7d6')
    expect(prompt).toContain('#2f5233')
  })

  it('forbids lettering, which is where an image model goes wrong', () => {
    expect(prompt).toMatch(/no text/i)
    expect(prompt).toMatch(/labels/)
  })
})

describe('drawPending', () => {
  it('draws each commission, keeps it, and credits it', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    const asked = drawer()
    const { db, kept } = store()

    const res = await drawPending(db, 'les-1', lesson('a pea pod'))

    expect(asked).toHaveBeenCalledTimes(1)
    expect(kept).toHaveLength(1)
    expect(kept[0]).toMatch(/^les-1\/.+\.webp$/)
    expect(res.drawn).toBe(1)
    expect(res.dropped).toBe(0)
    expect(res.text).toContain(`"url": "https://store.example/${kept[0]}"`)
    expect(res.text).toContain(`"source": "${DRAWN_CREDIT}"`)
    expect(res.text).toContain('Prose.')
    expect(pendingDrawings(res.text)).toHaveLength(0)
  })

  it(`draws ${DRAWINGS_MAX} at most and takes the rest out`, async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    const asked = drawer()
    const { db } = store()

    const res = await drawPending(db, 'les-1', lesson('one', 'two', 'three'))

    expect(asked).toHaveBeenCalledTimes(DRAWINGS_MAX)
    expect(res.drawn).toBe(DRAWINGS_MAX)
    expect(res.dropped).toBe(1)
    expect(pendingDrawings(res.text)).toHaveLength(0)
  })

  it('takes out a drawing that did not come back, so it is not asked for again', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    drawer(false)
    const { db } = store()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await drawPending(db, 'les-1', lesson('a pea pod'))

    expect(res.drawn).toBe(0)
    expect(res.dropped).toBe(1)
    expect(res.text).not.toContain('pea pod')
    expect(res.text).toContain('The end.')
  })

  it('takes out a drawing that could not be kept', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    drawer()
    const { db } = store(true)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await drawPending(db, 'les-1', lesson('a pea pod'))
    expect(res.dropped).toBe(1)
  })
})

describe('settlePictures and commissions', () => {
  it('leaves a commission for the drawing round when drawing is on', async () => {
    const res = await settlePictures(lesson('a pea pod'), { keepCommissions: true })
    expect(pendingDrawings(res.text)).toHaveLength(1)
    expect(res.dropped).toBe(0)
  })

  it('takes a commission out when drawing is off, as an address that goes nowhere', async () => {
    const res = await settlePictures(lesson('a pea pod'))
    expect(pendingDrawings(res.text)).toHaveLength(0)
    expect(res.dropped).toBe(1)
  })
})
