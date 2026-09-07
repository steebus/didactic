import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.fn()
vi.mock('openai', () => ({
  default: class { embeddings = { create: mockCreate } }
}))

beforeEach(() => { mockCreate.mockReset() })

describe('embed', () => {
  it('returns the vector from the API response', async () => {
    mockCreate.mockResolvedValue({ data: [{ embedding: new Array(1536).fill(0.1) }] })
    const { embed } = await import('@/lib/embedding')
    const result = await embed('React hooks')
    expect(result).toHaveLength(1536)
    expect(mockCreate).toHaveBeenCalledWith({
      model: 'text-embedding-3-small',
      input: 'React hooks',
    })
  })

  it('throws when the text is empty, rather than embedding nothing', async () => {
    const { embed } = await import('@/lib/embedding')
    await expect(embed('   ')).rejects.toThrow('empty text')
  })
})
