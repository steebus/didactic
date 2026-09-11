import { describe, it, expect } from 'vitest'
import { lessonSections, outlineFrom, slugFor } from '../src/sections'

describe('slugFor', () => {
  it('names a heading the way a link expects to be written', () => {
    expect(slugFor('What germination costs')).toBe('what-germination-costs')
  })

  it('drops punctuation rather than encoding it', () => {
    expect(slugFor('Why now? (and not later)')).toBe('why-now-and-not-later')
  })

  it('folds accents onto the letters they sit on', () => {
    expect(slugFor('Café notes')).toBe('cafe-notes')
  })

  it('still names a heading with nothing nameable in it', () => {
    expect(slugFor('—')).toBe('section')
    expect(slugFor('')).toBe('section')
  })
})

describe('outlineFrom', () => {
  it('keeps the reading order and the depth', () => {
    expect(
      outlineFrom([
        { level: 2, text: 'First' },
        { level: 3, text: 'Under it' },
        { level: 2, text: 'Second' },
      ])
    ).toEqual([
      { id: 'first', text: 'First', level: 2 },
      { id: 'under-it', text: 'Under it', level: 3 },
      { id: 'second', text: 'Second', level: 2 },
    ])
  })

  it('numbers the second section of the same name rather than colliding', () => {
    const sections = outlineFrom([
      { level: 3, text: 'Example' },
      { level: 3, text: 'Example' },
      { level: 3, text: 'Example' },
    ])
    expect(sections.map(s => s.id)).toEqual(['example', 'example-2', 'example-3'])
  })

  it('numbers unnameable headings apart from each other too', () => {
    expect(outlineFrom([{ level: 2, text: '—' }, { level: 2, text: '·' }]).map(s => s.id)).toEqual([
      'section',
      'section-2',
    ])
  })
})

describe('lessonSections', () => {
  it('reads the headings of a lesson in order', () => {
    const body = [
      '# What this is',
      '',
      'Some prose.',
      '',
      '## The hard part',
      '',
      'More prose.',
      '',
      '### An example',
    ].join('\n')

    expect(lessonSections(body)).toEqual([
      { id: 'what-this-is', text: 'What this is', level: 1 },
      { id: 'the-hard-part', text: 'The hard part', level: 2 },
      { id: 'an-example', text: 'An example', level: 3 },
    ])
  })

  it('says what the heading says, without the marks that styled it', () => {
    expect(lessonSections('## The **hard** part\n\n## A `literal` one')).toEqual([
      { id: 'the-hard-part', text: 'The hard part', level: 2 },
      { id: 'a-literal-one', text: 'A literal one', level: 2 },
    ])
  })

  it('leaves a comment in a code fence out of the contents', () => {
    const body = ['## Real', '', '```sh', '# not a heading', '```', '', '## Also real'].join('\n')
    expect(lessonSections(body).map(s => s.text)).toEqual(['Real', 'Also real'])
  })

  it('leaves what is inside a lesson block out of it', () => {
    const body = ['## Real', '', '```check', '{"question":"# Q","options":[]}', '```'].join('\n')
    expect(lessonSections(body).map(s => s.text)).toEqual(['Real'])
  })

  it('reads an underlined heading, and does not read a rule as one', () => {
    expect(lessonSections('A title\n=======\n\nProse.\n\nUnder\n-----').map(s => s.level)).toEqual([
      1, 2,
    ])
    expect(lessonSections('Prose.\n\n---\n\nMore prose.')).toEqual([])
  })

  it('goes no deeper than the three levels worth listing', () => {
    expect(lessonSections('#### Too deep\n\n##### Deeper').map(s => s.text)).toEqual([])
  })

  it('finds nothing in a lesson with no headings', () => {
    expect(lessonSections('Just prose, all the way down.')).toEqual([])
  })
})
