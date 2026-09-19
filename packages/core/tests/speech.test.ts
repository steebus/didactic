import { describe, it, expect } from 'vitest'
import { speakable, speechChunks, spokenMinutes } from '../src/speech'

describe('speakable', () => {
  it('says the words inside emphasis, not the markers', () => {
    expect(speakable('This is **the default**, and *not* a technicality.')).toBe(
      'This is the default, and not a technicality.'
    )
  })

  it('says a link by its text and never its URL', () => {
    expect(speakable('See [the transfer agent](https://example.com/agents) for this.')).toBe(
      'See the transfer agent for this.'
    )
  })

  it('says an identifier without its backticks', () => {
    expect(speakable('The `body_finished` column answers it.')).toBe(
      'The body_finished column answers it.'
    )
  })

  it('leaves snake_case alone when underscores are not emphasis', () => {
    expect(speakable('Set body_finished on the row.')).toBe('Set body_finished on the row.')
  })

  it('says a heading as its words, and stops on it', () => {
    // The full stop is what keeps a heading from running into the
    // paragraph below it as one sentence a hundred words long.
    expect(speakable('## Two ways to be an owner')).toBe('Two ways to be an owner.')
  })

  it('does not double the stop on a heading that has one', () => {
    expect(speakable('## Why now?')).toBe('Why now?')
  })

  it('drops list markers, keeping the items, each stopped on', () => {
    // Stopped on for the reason a heading is: seven bullets with no
    // terminator between them are one sentence a hundred words long.
    expect(speakable('- first thing\n- second thing')).toBe('first thing.\nsecond thing.')
  })

  it('drops an image entirely, having nothing to say', () => {
    expect(speakable('Before ![a chart of returns](/chart.png) after')).toBe('Before after')
  })

  it('says inline maths the way a person reads it', () => {
    expect(speakable('Once $b^n$ reads instantly, the rest follows.')).toBe(
      'Once b to the power n reads instantly, the rest follows.'
    )
    expect(speakable('So $2^4$ is not $2 \\times 4$.')).toBe(
      'So 2 to the power 4 is not 2 times 4.'
    )
  })

  it('says nothing about display maths, which is a figure', () => {
    // It stands on its own line and the sentence is complete without
    // it, the same as a chart.
    const body = ['Which gives:', '', '$$b^n = \\underbrace{b \\times b}_{n}$$'].join('\n')
    expect(speakable(body)).toBe('Which gives:')
  })

  it('drops inline notation it has no way to say', () => {
    // Better silence than a voice dictating backslashes.
    expect(speakable('The bound $\\sum_{i=0}^{n} \\alpha_i$ holds.')).toBe('The bound holds.')
  })

  it('keeps the blank line that separates paragraphs', () => {
    expect(speakable('One paragraph.\n\nAnother paragraph.')).toBe(
      'One paragraph.\n\nAnother paragraph.'
    )
  })
})

describe('speechChunks', () => {
  it('says nothing about a registered block', () => {
    const body = [
      '# Ownership',
      '',
      'Prose before the block that is long enough to stand on its own as a chunk of narration, because a heading alone would be joined to whatever follows it.',
      '',
      '```check',
      '{ "question": "Who is on the books?", "options": ["You", "The nominee"] }',
      '```',
      '',
      'Prose after the block, also long enough to be its own piece of the lesson rather than being folded into the one before it.',
    ].join('\n')

    const text = speechChunks(body)
      .map(c => c.text)
      .join(' ')
    expect(text).toContain('Prose before')
    expect(text).toContain('Prose after')
    expect(text).not.toContain('question')
    expect(text).not.toContain('nominee')
  })

  it('says nothing about a plain code fence either', () => {
    const body = [
      'Here is how the selector is written, and this sentence is long enough to be a chunk of its own once the stylesheet below has been taken out of the lesson.',
      '',
      '```css',
      '.player { position: fixed; bottom: 0; }',
      '```',
    ].join('\n')

    const text = speechChunks(body)
      .map(c => c.text)
      .join(' ')
    expect(text).toContain('how the selector is written')
    expect(text).not.toContain('position')
    expect(text).not.toContain('fixed')
  })

  it('says nothing about a block whose payload is malformed', () => {
    // parseBlocks hands a broken payload back as markdown so the sheet
    // can still show it. Spoken, that is a voice dictating JSON.
    const body = [
      'Real prose that belongs in the audio, long enough to stand as a chunk of narration on its own once the broken block below has been taken out of the lesson.',
      '',
      '```blank',
      '{ "question": "Fill in the trade-off", "text": "many small {{1}} instead",',
      '```',
    ].join('\n')

    const text = speechChunks(body)
      .map(c => c.text)
      .join(' ')
    expect(text).toContain('Real prose that belongs')
    expect(text).not.toContain('question')
    expect(text).not.toContain('{{1}}')
  })

  it('is not fooled by a fence quoted inside a block payload', () => {
    // A real lesson about bundlers has exactly this: a ```blank whose
    // JSON quotes a fence in a string. Ending the region at the inner
    // marker spills the rest of the payload into the narration.
    const body = [
      'Real prose that belongs in the audio, written long enough to stand as a chunk of narration all by itself once the block underneath has gone.',
      '',
      '```blank',
      '{',
      '  "question": "Fill in the trade-off",',
      '  "text": "Webpack supports this with a magic comment: ``` import(...) ```"',
      '}',
      '```',
      '',
      'More prose afterwards, also long enough that it is kept as a chunk of its own and can be checked for on the far side of the block.',
    ].join('\n')

    const text = speechChunks(body)
      .map(c => c.text)
      .join(' ')
    expect(text).toContain('Real prose that belongs')
    expect(text).toContain('More prose afterwards')
    expect(text).not.toContain('question')
    expect(text).not.toContain('Webpack')
  })

  it('carries a heading into the paragraph it names', () => {
    const body = [
      '## Two ways to be an owner',
      '',
      'Direct registration means your name sits on the company books, kept by its transfer agent, and you are the shareholder of record for every purpose that matters.',
    ].join('\n')

    const chunks = speechChunks(body)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).toBe(
      'Two ways to be an owner. Direct registration means your name sits on the company books, kept by its transfer agent, and you are the shareholder of record for every purpose that matters.'
    )
  })

  it('numbers chunks in reading order without gaps', () => {
    const body = Array.from(
      { length: 4 },
      (_, i) =>
        `Paragraph number ${i} of this lesson, written at a length that comfortably clears the joining floor so that it stands as a chunk of its own rather than being run together with the paragraph that happens to follow it down the page.`
    ).join('\n\n')

    expect(speechChunks(body).map(c => c.index)).toEqual([0, 1, 2, 3])
  })

  it('cuts an overlong paragraph at a sentence end, never mid-word', () => {
    const sentence = 'This is a sentence of quite ordinary length that says something. '
    const chunks = speechChunks(sentence.repeat(40))

    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(1200)
      expect(chunk.text).toMatch(/\.$/)
    }
    // Nothing is lost in the cutting.
    expect(chunks.map(c => c.text).join(' ').replace(/\s+/g, ' ')).toBe(
      sentence.repeat(40).trim().replace(/\s+/g, ' ')
    )
  })

  it('leaves a long paragraph with no sentence end whole rather than cutting mid-word', () => {
    const runOn = 'word '.repeat(400).trim()
    const chunks = speechChunks(runOn)

    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).toBe(runOn)
  })

  it('has nothing to say about a lesson that is only blocks', () => {
    const body = ['```sort', '{ "items": ["a", "b"] }', '```'].join('\n')
    expect(speechChunks(body)).toEqual([])
  })

  it('drops a line that is punctuation once the markup is gone', () => {
    const body = ['---', '', '| a | b |', '| - | - |'].join('\n')
    expect(speechChunks(body)).toEqual([])
  })

  it('survives a fence that is never closed', () => {
    const body = ['Real prose that should still be said out loud.', '', '```css', '.a { b: c; }'].join(
      '\n'
    )
    const text = speechChunks(body)
      .map(c => c.text)
      .join(' ')
    expect(text).toContain('Real prose')
    expect(text).not.toContain('{')
  })
})

describe('spokenMinutes', () => {
  it('counts words at ordinary narration speed', () => {
    const chunks = [{ index: 0, text: 'word '.repeat(300).trim() }]
    expect(spokenMinutes(chunks)).toBeCloseTo(2, 5)
  })

  it('is zero for a lesson with nothing to say', () => {
    expect(spokenMinutes([])).toBe(0)
  })
})
