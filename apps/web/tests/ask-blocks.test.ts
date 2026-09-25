import { describe, it, expect } from 'vitest'
import { parseBlocks, BLOCKS } from '@didactic/core/blocks'

/**
 * What the agent draws with.
 *
 * The panel renders an answer through `Prose`, the same component the
 * lesson sheet uses, so a block the agent writes has to parse exactly as
 * one written into a lesson does. This is the test that catches the two
 * drifting apart.
 */
describe('a block in a chat message', () => {
  it('parses every block in the registry, so chat and lessons cannot drift', () => {
    for (const spec of BLOCKS) {
      const message = `Here is one:\n\n\`\`\`${spec.name}\n${spec.example}\n\`\`\`\n\nAnd prose after it.`
      const parsed = parseBlocks(message)
      const block = parsed.find(p => p.kind === 'block')
      expect(block, `${spec.name} did not parse out of a message`).toBeTruthy()
      expect(block && block.kind === 'block' && block.name).toBe(spec.name)
    }
  })

  it('keeps the prose on either side of it', () => {
    const spec = BLOCKS[0]
    const parsed = parseBlocks(`Before.\n\n\`\`\`${spec.name}\n${spec.example}\n\`\`\`\n\nAfter.`)
    const prose = parsed.filter(p => p.kind === 'markdown').map(p => (p.kind === 'markdown' ? p.text : '')).join('')
    expect(prose).toContain('Before.')
    expect(prose).toContain('After.')
  })

  it('leaves a malformed payload as prose rather than losing the message', () => {
    const parsed = parseBlocks('Before.\n\n```chart\n{ not json\n```\n\nAfter.')
    expect(parsed.every(p => p.kind === 'markdown')).toBe(true)
    const all = parsed.map(p => (p.kind === 'markdown' ? p.text : '')).join('')
    expect(all).toContain('After.')
  })
})
