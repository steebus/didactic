import { describe, it, expect } from 'vitest'
import { parseBlocks, blockPromptSection, BLOCKS } from '@/lib/blocks'

describe('parseBlocks', () => {
  it('leaves a body with no blocks alone', () => {
    const parsed = parseBlocks('# Heading\n\nSome prose.')
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toEqual({ kind: 'markdown', text: '# Heading\n\nSome prose.' })
  })

  it('pulls a block out from between prose', () => {
    const body = 'Before.\n\n```check\n{"question":"Q","options":[]}\n```\n\nAfter.'
    const parsed = parseBlocks(body)
    expect(parsed.map(p => p.kind)).toEqual(['markdown', 'block', 'markdown'])
    const block = parsed[1]
    expect(block.kind === 'block' && block.name).toBe('check')
  })

  it('keeps two blocks separate rather than merging them', () => {
    const body = '```check\n{"a":1}\n```\n\nBetween.\n\n```check\n{"b":2}\n```'
    const parsed = parseBlocks(body)
    const blocks = parsed.filter(p => p.kind === 'block')
    expect(blocks).toHaveLength(2)
    expect(blocks[0].kind === 'block' && blocks[0].data).toEqual({ a: 1 })
    expect(blocks[1].kind === 'block' && blocks[1].data).toEqual({ b: 2 })
  })

  it('leaves an ordinary code block as prose', () => {
    const body = '```ts\nconst x = 1\n```'
    const parsed = parseBlocks(body)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].kind).toBe('markdown')
  })

  it('keeps a malformed payload rather than losing the section', () => {
    const body = '```chart\n{not json}\n```'
    const parsed = parseBlocks(body)
    expect(parsed[0].kind).toBe('markdown')
    expect(parsed[0].kind === 'markdown' && parsed[0].text).toContain('not json')
  })

  // Every example doubles as the prompt's sample and as a fixture. If
  // one stops parsing, the agent is being shown something that does not
  // work.
  it.each(BLOCKS.map(b => [b.name, b] as const))('parses the %s example', (_name, spec) => {
    const parsed = parseBlocks('```' + spec.name + '\n' + spec.example + '\n```')
    expect(parsed).toHaveLength(1)
    expect(parsed[0].kind).toBe('block')
  })
})

describe('blockPromptSection', () => {
  it('names every registered block, so adding one teaches the agent', () => {
    const prompt = blockPromptSection()
    for (const b of BLOCKS) expect(prompt).toContain('```' + b.name)
  })
})
