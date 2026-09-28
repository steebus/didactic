import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * `/api/ask/[id]/draw`: the answer's commission drawn after the turn,
 * and the reason written under the answer when it could not be.
 */

const { state, drawPending } = vi.hoisted(() => ({
  state: { content: '', updated: null as string | null, owned: true },
  drawPending: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ ownerId: async () => 'user-1' }))
vi.mock('@/lib/features', () => ({ drawingOn: () => true }))
vi.mock('@/lib/drawings', () => ({ drawPending }))
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () =>
          table === 'conversations'
            ? { data: state.owned ? { id: 'c1' } : null }
            : { data: { id: 'm1', content: state.content } },
        update: (row: { content: string }) => {
          state.updated = row.content
          return { eq: async () => ({ error: null }) }
        },
      }
      return chain
    },
  }),
}))

const commission = ['Prose.', '', '```picture', JSON.stringify({ draw: 'a flower', alt: 'A flower' }), '```'].join('\n')

const draw = async () => {
  const { POST } = await import('@/app/api/ask/[id]/draw/route')
  const res = await POST(new Request('http://localhost/api/ask/c1/draw', { method: 'POST' }), {
    params: Promise.resolve({ id: 'c1' }),
  })
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  state.content = commission
  state.updated = null
  state.owned = true
  drawPending.mockReset()
})

describe('drawing an answer’s picture', () => {
  it('stores the answer with the drawing in it', async () => {
    drawPending.mockResolvedValue({ text: 'Prose.\n\n(drawn)', drawn: 1, dropped: 0, reasons: [] })
    const { body } = await draw()
    expect(drawPending).toHaveBeenCalledWith(expect.anything(), 'ask/c1', commission, 'Drawn for this answer')
    expect(body.text).toBe('Prose.\n\n(drawn)')
    expect(state.updated).toBe('Prose.\n\n(drawn)')
  }, 30_000)

  it('writes the reason under the answer when it could not be drawn', async () => {
    drawPending.mockResolvedValue({ text: 'Prose.', drawn: 0, dropped: 1, reasons: ['gateway: timed out'] })
    const { body } = await draw()
    expect(body.warning).toBe('The drawing could not be made: gateway: timed out.')
    expect(state.updated).toBe('Prose.\n\n*The drawing could not be made: gateway: timed out.*')
  })

  it('does nothing to an answer with nothing to draw', async () => {
    state.content = 'Prose.'
    const { body } = await draw()
    expect(drawPending).not.toHaveBeenCalled()
    expect(body.text).toBe('Prose.')
    expect(state.updated).toBeNull()
  })

  it('will not draw in somebody else’s conversation', async () => {
    state.owned = false
    const { status } = await draw()
    expect(status).toBe(404)
  })
})
