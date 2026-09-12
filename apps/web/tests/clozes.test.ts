import { describe, it, expect } from 'vitest'
import { verify, type ProposedConcept } from '@/lib/llm/clozes'
import { prefixFor, ratingWord } from '@/lib/clozes'
import { AGAIN, EASY, GOOD, HARD } from '@didactic/core/fsrs'

const BODY = `## What exposure is

Saving a resource is intent; only consuming it counts. That distinction is
the mechanism: it makes the map an honest record rather than a wishlist.

Ability is estimated by the app and is never set by hand. A mark is the
lightest exposure there is.`

const concept = (over: Partial<ProposedConcept> = {}): ProposedConcept => ({
  name: 'Exposure is not intent',
  gist: 'What counts is consumption, not saving.',
  clozes: [
    { text: 'Saving a resource is intent; only consuming it counts.', blank: 'consuming' },
    { text: 'Ability is estimated by the app and is never set by hand.', blank: 'never set by hand' },
  ],
  ...over,
})

describe('verifying what the model proposed', () => {
  it('keeps a concept whose passages are all genuinely in the lesson', () => {
    const kept = verify([concept()], BODY)
    expect(kept).toHaveLength(1)
    expect(kept[0].clozes).toHaveLength(2)
  })

  it('drops a passage the model tidied on its way past', () => {
    // One changed word. The passage is shown back inside the lesson, so
    // a sentence that was improved is a sentence the reader will not
    // recognise -- and one that can never be drawn on its own prose.
    const tidied = concept({
      clozes: [
        { text: 'Saving a resource is intent; only consuming it matters.', blank: 'consuming' },
        { text: 'Ability is estimated by the app and is never set by hand.', blank: 'never set by hand' },
        { text: 'A mark is the lightest exposure there is.', blank: 'lightest' },
      ],
    })
    const kept = verify([tidied], BODY)
    expect(kept[0].clozes.map(c => c.text)).toEqual([
      'Ability is estimated by the app and is never set by hand.',
      'A mark is the lightest exposure there is.',
    ])
  })

  it('forgives only the whitespace markdown wraps a sentence in', () => {
    const wrapped = concept({
      clozes: [
        {
          // As it reads on the page; the source has a newline in it.
          text: 'That distinction is the mechanism: it makes the map an honest record rather than a wishlist.',
          blank: 'an honest record',
        },
        { text: 'A mark is the lightest exposure there is.', blank: 'lightest' },
      ],
    })
    expect(verify([wrapped], BODY)[0].clozes).toHaveLength(2)
  })

  it('drops a blank that is not inside its own passage', () => {
    const wrong = concept({
      clozes: [
        { text: 'Saving a resource is intent; only consuming it counts.', blank: 'photosynthesis' },
        { text: 'Ability is estimated by the app and is never set by hand.', blank: 'never set by hand' },
        { text: 'A mark is the lightest exposure there is.', blank: 'lightest' },
      ],
    })
    expect(verify([wrong], BODY)[0].clozes).toHaveLength(2)
  })

  it('drops a concept left with fewer than two answerable cards', () => {
    // One card over a concept is a phrasing memorised, not a thing
    // held, which is the whole reason a concept carries several.
    const thin = concept({
      clozes: [
        { text: 'Saving a resource is intent; only consuming it counts.', blank: 'consuming' },
        { text: 'Something the lesson never said.', blank: 'never' },
      ],
    })
    expect(verify([thin], BODY)).toHaveLength(0)
  })

  it('asks one passage once, however it is blanked', () => {
    const twice = concept({
      clozes: [
        { text: 'Saving a resource is intent; only consuming it counts.', blank: 'consuming' },
        { text: 'Saving a resource is intent; only consuming it counts.', blank: 'intent' },
        { text: 'A mark is the lightest exposure there is.', blank: 'lightest' },
      ],
    })
    const kept = verify([twice], BODY)[0].clozes
    expect(kept).toHaveLength(2)
    expect(new Set(kept.map(c => c.text)).size).toBe(2)
  })

  it('never keeps more than four concepts', () => {
    // Six concepts over twelve distinct sentences: the cap is the cap,
    // not an artefact of running out of lesson.
    const sentences = Array.from(
      { length: 12 },
      (_, i) => `Sentence number ${i} says something worth keeping about it.`
    )
    const wide = Array.from({ length: 6 }, (_, i) => ({
      name: `Concept ${i}`,
      gist: 'Something.',
      clozes: [
        { text: sentences[i * 2], blank: 'worth keeping' },
        { text: sentences[i * 2 + 1], blank: 'worth keeping' },
      ],
    }))
    expect(verify(wide, sentences.join(' '))).toHaveLength(4)
  })

  it('asks one passage once across the whole lesson, not once per concept', () => {
    // Two concepts reaching for the same sentence is the model saying
    // the same thing twice. The second concept is left with one card
    // and is dropped with it.
    const shared = { text: 'A mark is the lightest exposure there is.', blank: 'lightest' }
    const first = concept({ name: 'One', clozes: [shared, {
      text: 'Saving a resource is intent; only consuming it counts.', blank: 'consuming',
    }] })
    const second = concept({ name: 'Two', clozes: [shared, {
      text: 'Ability is estimated by the app and is never set by hand.', blank: 'never set by hand',
    }] })
    expect(verify([first, second], BODY).map(c => c.name)).toEqual(['One'])
  })

  it('keeps at most three cards under one concept', () => {
    const many = concept({
      clozes: [
        { text: 'Saving a resource is intent; only consuming it counts.', blank: 'consuming' },
        { text: 'Ability is estimated by the app and is never set by hand.', blank: 'never set by hand' },
        { text: 'A mark is the lightest exposure there is.', blank: 'lightest' },
        {
          text: 'That distinction is the mechanism: it makes the map an honest record rather than a wishlist.',
          blank: 'an honest record',
        },
      ],
    })
    expect(verify([many], BODY)[0].clozes).toHaveLength(3)
  })

  it('drops a passage too long to answer in one go', () => {
    const long = 'word '.repeat(120)
    expect(verify([concept({ clozes: [{ text: long, blank: 'word' }] })], `${BODY}${long}`)).toHaveLength(0)
  })

  it('survives a model answering with nothing, or with rubbish', () => {
    expect(verify([], BODY)).toEqual([])
    expect(
      verify([{ name: '  ', gist: '', clozes: [] } as ProposedConcept], BODY)
    ).toEqual([])
  })
})

describe('prefixFor', () => {
  it('takes what came before the passage, as the prose reads it', () => {
    const prefix = prefixFor(BODY, 'That distinction is the mechanism')
    expect(prefix).not.toBeNull()
    expect(prefix!.endsWith('counts.')).toBe(true)
  })

  it('answers with nothing for a passage that opens the lesson', () => {
    expect(prefixFor('Straight in at the top.', 'Straight in')).toBeNull()
  })

  it('answers with nothing for a passage that is not there', () => {
    expect(prefixFor(BODY, 'Something the lesson never said')).toBeNull()
  })
})

describe('ratingWord', () => {
  it('names each of the scheduler\'s four rungs as the enum holds it', () => {
    expect(ratingWord(AGAIN)).toBe('again')
    expect(ratingWord(HARD)).toBe('hard')
    expect(ratingWord(GOOD)).toBe('good')
    expect(ratingWord(EASY)).toBe('easy')
  })
})
