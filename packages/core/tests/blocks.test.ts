import { describe, it, expect } from 'vitest'
import { parseBlocks, blockPromptSection, BLOCKS } from '../src/blocks'
import { parseBlanks, acceptsAnswer, allCorrect } from '../src/answers'
import { readModel, runModel, type ModelSpec } from '../src/model'

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

/**
 * The question blocks' examples have to be answerable, not just
 * parseable.
 *
 * Each one is the fixture the parser is tested against and the example
 * the writing agent is shown, so an example whose gaps do not match its
 * answers teaches that shape to every lesson written afterwards -- and
 * the block it produces stands down at render time, silently, leaving a
 * hole where a question was meant to be.
 */
describe('the question examples are answerable', () => {
  const payload = <T,>(name: string): T =>
    JSON.parse(BLOCKS.find(b => b.name === name)!.example) as T

  it('the blank example has a gap for every answer and an answer for every gap', () => {
    const blank = payload<{ text: string; blanks: Array<{ accept: string[] }> }>('blank')
    expect(parseBlanks(blank.text, blank.blanks.length)).not.toBeNull()
    // And every gap has something that would be taken as right.
    for (const gap of blank.blanks) expect(gap.accept.length).toBeGreaterThan(0)
  })

  it('the blank example is right when its own answers are typed in', () => {
    const blank = payload<{ text: string; blanks: Array<{ accept: string[] }> }>('blank')
    const marks = blank.blanks.map(gap => acceptsAnswer(gap.accept[0], gap.accept))
    expect(allCorrect(marks)).toBe(true)
  })

  it('every item in the sort example names a group that exists', () => {
    const sort = payload<{ groups: string[]; items: Array<{ group: string }> }>('sort')
    expect(sort.groups.length).toBeGreaterThanOrEqual(2)
    for (const item of sort.items) expect(sort.groups).toContain(item.group)
  })

  it('the sort example uses every group it declares', () => {
    // A group nothing belongs in is a bucket the reader can only get
    // wrong by using, which is not a question, it is a trap.
    const sort = payload<{ groups: string[]; items: Array<{ group: string }> }>('sort')
    const used = new Set(sort.items.map(i => i.group))
    for (const group of sort.groups) expect(used.has(group)).toBe(true)
  })

  it('the model example reads, runs, and pays itself off', () => {
    // The example is what every model block written afterwards is
    // modelled on, so it has to be a model that actually works --
    // not merely one that parses.
    const model = readModel(payload<ModelSpec>('model'))
    expect(model).not.toBeNull()

    const run = runModel(
      model!,
      Object.fromEntries(model!.sliders.map(s => [s.id, s.value]))
    )
    expect(run.incomplete).toBe(false)
    expect(run.readouts[0].value).toBeGreaterThan(0)

    // A repayment mortgage owes nothing at the end of its term. If the
    // example's own arithmetic does not do that, it is teaching the
    // shape of a wrong model.
    const balance = run.series[0].values
    expect(balance[0]).toBeGreaterThan(0)
    expect(balance.at(-1)).toBeCloseTo(0, 4)
  })

  it('the model example works at both ends of every slider', () => {
    // The prompt tells the writing agent to check this, so the example
    // it is told to copy had better survive it.
    const model = readModel(payload<ModelSpec>('model'))!
    for (const slider of model.sliders) {
      for (const end of [slider.min, slider.max]) {
        const at = Object.fromEntries(model.sliders.map(s => [s.id, s.value]))
        const run = runModel(model, { ...at, [slider.id]: end })
        expect(run.incomplete, `${slider.id} at ${end}`).toBe(false)
      }
    }
  })

  it('the check example has exactly one right answer', () => {
    const check = payload<{ options: Array<{ correct?: boolean }> }>('check')
    expect(check.options.filter(o => o.correct).length).toBe(1)
  })
})

describe('blockPromptSection', () => {
  it('names every registered block, so adding one teaches the agent', () => {
    const prompt = blockPromptSection()
    for (const b of BLOCKS) expect(prompt).toContain('```' + b.name)
  })
})
