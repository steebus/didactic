import { describe, it, expect } from 'vitest'
import { verify, type ProposedCard, type ProposedConcept } from '@/lib/llm/clozes'
import { cardColumns, prefixFor, ratingWord } from '@/lib/clozes'
import { AGAIN, EASY, GOOD, HARD } from '@didactic/core/fsrs'

const BODY = `## What exposure is

Saving a resource is intent; only consuming it counts. That distinction is
the mechanism: it makes the map an honest record rather than a wishlist.

Ability is estimated by the app and is never set by hand. A mark is the
lightest exposure there is.`

const CLOZE: ProposedCard = {
  kind: 'cloze',
  text: 'Saving a resource is intent; only consuming it counts.',
  blank: 'consuming',
}

const QA: ProposedCard = {
  kind: 'qa',
  question: 'What makes the map an honest record rather than a wishlist?',
  answer: 'Counting only what was consumed, not what was saved.',
}

const concept = (over: Partial<ProposedConcept> = {}): ProposedConcept => ({
  name: 'Exposure is not intent',
  gist: 'What counts is consumption, not saving.',
  cards: [CLOZE, QA],
  ...over,
})

describe('verifying what the model proposed', () => {
  it('keeps a concept whose cards all hold together', () => {
    const kept = verify([concept()], BODY)
    expect(kept).toHaveLength(1)
    expect(kept[0].cards).toHaveLength(2)
  })

  /* The whole point of 046. A card is written *from* the lesson now,
     not cut out of it, so a sentence the lesson never wrote is an
     ordinary card rather than a dropped one. */
  it('keeps a cloze whose sentence is nowhere in the lesson', () => {
    const written: ProposedCard = {
      kind: 'cloze',
      text: 'An exposure is only counted once the resource has been consumed.',
      blank: 'consumed',
    }
    const kept = verify([concept({ cards: [written, QA] })], BODY)
    expect(kept[0].cards).toHaveLength(2)
    expect(kept[0].cards[0].text).toContain('only counted once')
  })

  it('keeps an anchor the lesson genuinely contains', () => {
    const kept = verify(
      [concept({ cards: [{ ...CLOZE, anchor: 'A mark is the lightest exposure there is.' }, QA] })],
      BODY
    )
    expect(kept[0].cards[0].anchor).toBe('A mark is the lightest exposure there is.')
  })

  it('forgives only the whitespace markdown wraps an anchor in', () => {
    const wrapped = 'That distinction is the mechanism: it makes the map an honest record rather than a wishlist.'
    const kept = verify([concept({ cards: [{ ...CLOZE, anchor: wrapped }, QA] })], BODY)
    expect(kept[0].cards[0].anchor).toBe(wrapped)
  })

  /* An anchor is a promise the painter relies on. One the model tidied
     on its way past would wash the wrong words, or none -- so it goes,
     and the card it came on stays. */
  it('drops an anchor the model tidied, and keeps the card', () => {
    const kept = verify(
      [concept({ cards: [{ ...CLOZE, anchor: 'Saving a resource is intent, only consuming it counts.' }, QA] })],
      BODY
    )
    expect(kept[0].cards).toHaveLength(2)
    expect(kept[0].cards[0].anchor).toBeUndefined()
  })

  it('drops a blank that is not inside its own sentence', () => {
    const kept = verify(
      [concept({ cards: [{ ...CLOZE, blank: 'wishlist' }, QA, { ...QA, question: 'What is a mark?', answer: 'The lightest exposure there is.' }] })],
      BODY
    )
    expect(kept[0].cards.every(c => c.blank !== 'wishlist')).toBe(true)
  })

  /* A blank is a term, not a clause. This is the rule the old cards
     broke by the thousand, and it is enforced tighter here than on a
     reader's own hand-made card. */
  it('drops a blank the length of a clause', () => {
    const wordy: ProposedCard = {
      kind: 'cloze',
      text: 'A request from Sydney pays for the physical length of that path every time.',
      blank: 'the physical length of that path',
    }
    const kept = verify([concept({ cards: [wordy, CLOZE, QA] })], BODY)
    expect(kept[0].cards.every(c => c.blank !== 'the physical length of that path')).toBe(true)
  })

  it('keeps a blank of three words', () => {
    const three: ProposedCard = {
      kind: 'cloze',
      text: 'A request from Sydney pays for the physical length of that path every time.',
      blank: 'physical length',
    }
    const kept = verify([concept({ cards: [three, QA] })], BODY)
    expect(kept[0].cards[0].blank).toBe('physical length')
  })

  it('drops a true-or-false with no reason given', () => {
    const bare: ProposedCard = {
      kind: 'truefalse',
      question: 'Saving a resource counts as an exposure.',
      answer: 'False',
    }
    const kept = verify([concept({ cards: [bare, CLOZE, QA] })], BODY)
    expect(kept[0].cards.every(c => c.kind !== 'truefalse')).toBe(true)
  })

  it('reads a verdict the model cased its own way', () => {
    const shouted: ProposedCard = {
      kind: 'truefalse',
      question: 'Saving a resource counts as an exposure.',
      answer: 'false.',
      note: 'Only consuming it counts.',
    }
    const kept = verify([concept({ cards: [shouted, CLOZE] })], BODY)
    expect(kept[0].cards[0].answer).toBe('False')
  })

  it('drops a question whose answer is sitting inside it', () => {
    const giveaway: ProposedCard = {
      kind: 'qa',
      question: 'Is saving a resource intent rather than an exposure?',
      answer: 'intent',
    }
    const kept = verify([concept({ cards: [giveaway, CLOZE, QA] })], BODY)
    expect(kept[0].cards.every(c => c.answer !== 'intent')).toBe(true)
  })

  /* 047. The brief tells the model not to crib; this is what makes it
     true. A card that can be read off is graded *Easy*, honestly, and
     the scheduler files it away for four months on the strength of a
     reading — so a missing card is much the cheaper failure. */
  it('drops a cloze whose blanked words are still standing in its sentence', () => {
    const crib: ProposedCard = {
      kind: 'cloze',
      text: 'A CDN serves from the edge, which is what makes a CDN quick.',
      blank: 'CDN',
    }
    const kept = verify([concept({ cards: [crib, CLOZE, QA] })], BODY)
    expect(kept[0].cards.every(c => c.blank !== 'CDN')).toBe(true)
  })

  /* The concept's name is printed above every card under it, before the
     reader answers — and the model chose that one name for every card
     under it, which is exactly the mistake it cannot see. */
  it('drops a card whose answer is sitting in its concept name', () => {
    const named: ProposedCard = {
      kind: 'qa',
      question: 'What does the map become once only consumption counts?',
      answer: 'An honest record',
    }
    const kept = verify(
      [concept({ name: 'What an honest record costs', cards: [named, QA, CLOZE] })],
      BODY
    )
    expect(kept[0].cards).toHaveLength(2)
    expect(kept[0].cards.every(c => c.answer !== 'An honest record')).toBe(true)
  })

  /* A name that gives away every card under it takes the concept with
     it — not as a rule of its own, but because a concept whose cards
     have all gone has nothing left to plant. */
  it('drops the concept when its name gives away every card under it', () => {
    const second: ProposedCard = {
      kind: 'qa',
      question: 'What is the lightest exposure there is?',
      answer: 'A mark',
    }
    expect(
      verify(
        [concept({ name: 'A mark, and consuming rather than saving', cards: [CLOZE, second] })],
        BODY
      )
    ).toEqual([])
  })

  /* The other half of the same rule, now the minimum is one: a name
     that gives away one card of two costs that card and leaves the
     concept standing on the other. */
  it('keeps the concept on the card its name does not give away', () => {
    const kept = verify(
      [concept({ name: 'Consuming a resource, not saving it' })],
      BODY
    )
    expect(kept).toHaveLength(1)
    expect(kept[0].cards).toHaveLength(1)
    expect(kept[0].cards[0].kind).toBe('qa')
  })

  /* A nudge that answers is not a nudge. It goes on its own, though:
     the card around it is fine and is worth keeping without it. */
  it('strips a nudge that answers, and keeps the card', () => {
    const nudged: ProposedCard = { ...CLOZE, hint: 'Think about consuming it.' }
    const kept = verify([concept({ cards: [nudged, QA] })], BODY)
    expect(kept[0].cards).toHaveLength(2)
    expect(kept[0].cards[0].blank).toBe('consuming')
    expect(kept[0].cards[0].hint).toBeUndefined()
  })

  it('keeps a nudge that merely points', () => {
    const nudged: ProposedCard = { ...CLOZE, hint: 'Not the saving half.' }
    expect(verify([concept({ cards: [nudged, QA] })], BODY)[0].cards[0].hint).toBe(
      'Not the saving half.'
    )
  })

  /* A statement containing the word *true* has not revealed that it is
     true, and refusing it there would delete good cards for a word. */
  it('leaves a true-or-false out of the giveaway rule', () => {
    const fine: ProposedCard = {
      kind: 'truefalse',
      question: 'It is true that saving a resource counts as an exposure.',
      answer: 'False',
      note: 'Only consuming it counts.',
    }
    const kept = verify([concept({ cards: [fine, CLOZE] })], BODY)
    expect(kept[0].cards[0].kind).toBe('truefalse')
  })

  /* One card is enough to plant a concept: the maximum is two now, and
     a floor of two would drop every concept whose second card happened
     to fail a rule. */
  it('keeps a concept carrying a single answerable card', () => {
    const kept = verify([concept({ cards: [CLOZE] })], BODY)
    expect(kept).toHaveLength(1)
    expect(kept[0].cards).toHaveLength(1)
  })

  it('drops a concept left with no answerable cards at all', () => {
    const wordy: ProposedCard = {
      kind: 'cloze',
      text: 'A request from Sydney pays for the physical length of that path every time.',
      blank: 'the physical length of that path',
    }
    expect(verify([concept({ cards: [wordy] })], BODY)).toEqual([])
  })

  it('asks one question once, however it is punctuated', () => {
    const kept = verify(
      [concept({ cards: [QA, { ...QA, question: `${QA.question!.slice(0, -1)}` }, CLOZE] })],
      BODY
    )
    expect(kept[0].cards).toHaveLength(2)
  })

  /* The duplicate check that makes "write some more" safe: the fronts
     already standing are handed in, and anything matching one of them
     is dropped however the model was asked not to write it. */
  it('never asks again what the lesson already asks', () => {
    const standing = [
      'Saving a resource is intent; only ———— it counts.',
      QA.question!,
    ]
    expect(verify([concept()], BODY, standing)).toEqual([])
  })

  it('keeps the cards that are not already standing', () => {
    const standing = ['Saving a resource is intent; only ———— it counts.']
    const third: ProposedCard = {
      kind: 'qa',
      question: 'Who sets the ability figure?',
      answer: 'Nobody — the app estimates it.',
    }
    const kept = verify([concept({ cards: [CLOZE, QA, third] })], BODY, standing)
    expect(kept[0].cards).toHaveLength(2)
    expect(kept[0].cards.map(c => c.kind)).toEqual(['qa', 'qa'])
  })

  it('asks one question once across the whole lesson, not once per concept', () => {
    const kept = verify(
      [concept(), concept({ name: 'Another name for the same thing' })],
      BODY
    )
    expect(kept).toHaveLength(1)
  })

  it('never keeps more than four concepts', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      concept({
        name: `Concept ${i}`,
        cards: [
          { kind: 'qa' as const, question: `Question number ${i} about exposure?`, answer: `Answer ${i}` },
          { kind: 'qa' as const, question: `Second question number ${i} about it?`, answer: `Other answer ${i}` },
        ],
      })
    )
    expect(verify(many, BODY).length).toBeLessThanOrEqual(4)
  })

  it('keeps at most two cards under one concept', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({
      kind: 'qa' as const,
      question: `Question number ${i} about exposure?`,
      answer: `Answer ${i}`,
    }))
    expect(verify([concept({ cards: six })], BODY)[0].cards).toHaveLength(2)
  })

  it('drops a passage too long to answer in one go', () => {
    const long = { ...CLOZE, text: `${'Saving a resource is intent. '.repeat(20)}consuming` }
    const kept = verify([concept({ cards: [long, CLOZE, QA] })], BODY)
    expect(kept[0].cards).toHaveLength(2)
    expect(kept[0].cards.every(c => (c.text?.length ?? 0) < 400)).toBe(true)
  })

  it('survives a model answering with nothing, or with rubbish', () => {
    expect(verify([], BODY)).toEqual([])
    expect(verify([{ name: '', gist: '', cards: [] } as ProposedConcept], BODY)).toEqual([])
    expect(
      verify([{ name: 'Fine', gist: 'Fine', cards: [{} as ProposedCard] }], BODY)
    ).toEqual([])
  })
})

describe('the columns a card is written from', () => {
  it('gives a cloze its passage and its offsets, and no question', () => {
    const row = cardColumns({ ...CLOZE, anchor: CLOZE.text }, BODY)
    expect(row.kind).toBe('cloze')
    expect(row.text).toBe(CLOZE.text)
    expect(row.blank_start).toBe(CLOZE.text!.indexOf('consuming'))
    expect(row.blank_end).toBe(row.blank_start! + 'consuming'.length)
    expect(row.question).toBeNull()
    expect(row.answer).toBeNull()
  })

  /* What `clozes_shape` checks in the database, checked here too: a
     standard card carries nulls where a cloze carries its passage, so
     a row is never both shapes at once. */
  it('gives a standard card its front and back, and no passage', () => {
    const row = cardColumns(QA, BODY)
    expect(row.text).toBeNull()
    expect(row.blank).toBeNull()
    expect(row.blank_start).toBeNull()
    expect(row.blank_end).toBeNull()
    expect(row.question).toBe(QA.question)
    expect(row.answer).toBe(QA.answer)
  })

  it('takes the offset hint when the words appear twice', () => {
    const twice: ProposedCard = {
      kind: 'cloze',
      text: 'Saving is intent; intent is not the same as consuming.',
      blank: 'intent',
    }
    expect(twice.text!.indexOf('intent')).toBe(10)
    const row = cardColumns({ ...twice, blankStart: 18 })
    expect(row.blank_start).toBe(18)
  })

  it('ignores an offset hint that does not land on the words', () => {
    const row = cardColumns({ ...CLOZE, blankStart: 3 })
    expect(row.blank_start).toBe(CLOZE.text!.indexOf('consuming'))
  })

  /* The prefix is what tells two identical sentences apart when the
     wash is drawn, so it follows the anchor rather than the card's own
     written sentence -- the wash is drawn on the anchor. */
  it('takes the prefix from the anchor, not from the written sentence', () => {
    const row = cardColumns(
      {
        kind: 'cloze',
        text: 'An exposure is only counted once the resource has been consumed.',
        blank: 'consumed',
        anchor: 'That distinction is the mechanism',
      },
      BODY
    )
    expect(row.prefix).not.toBeNull()
    expect(row.prefix!.endsWith('counts.')).toBe(true)
  })

  it('leaves a card with no anchor without a prefix', () => {
    expect(cardColumns(QA, BODY).prefix).toBeNull()
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

/**
 * Why a reading came to nothing.
 *
 * Every rule in `verify` drops a card silently, which is right for the
 * card and wrong for the lesson: a reading where the model wrote twelve
 * cards and every one was refused is indistinguishable, from outside,
 * from a reading where it wrote none — and the two want opposite fixes.
 * The reader was told "this lesson is already asked every way it can
 * be" for both, which the app had no way of knowing.
 */
describe('what a reading says for itself', () => {
  const BODY =
    'The preload scanner runs ahead of the main parser. ' +
    'A font declared only inside a CSS file is invisible to it.'

  it('counts what was written and names why it went', async () => {
    const { verify, emptyReport, readingNote } = await import('@/lib/llm/clozes')
    const report = emptyReport()

    const kept = verify(
      [
        {
          name: 'The preload scanner',
          gist: 'Runs ahead of the parser.',
          cards: [
            // Answer sitting in its own question.
            { kind: 'qa', question: 'What is the preload scanner?', answer: 'the preload scanner' },
            // A blank that is a clause rather than a term.
            {
              kind: 'cloze',
              text: 'The preload scanner runs ahead of the main parser.',
              blank: 'runs ahead of the main parser',
            },
          ],
        },
      ],
      BODY,
      [],
      report
    )

    expect(kept).toHaveLength(0)
    expect(report.concepts).toBe(1)
    expect(report.wrote).toBe(2)
    expect(report.dropped).toBe(2)
    // The concept went with its cards, which is the rule that turns a
    // couple of refusals into a reading that plants nothing.
    expect(report.starved).toEqual(['The preload scanner'])

    const said = readingNote(report)
    expect(said).toContain('2 cards')
    expect(said).toContain('1 concept')
    expect(said).not.toMatch(/already asked every way/)
  })

  it('says plainly when the model named no concepts at all', async () => {
    const { verify, emptyReport, readingNote } = await import('@/lib/llm/clozes')
    const report = emptyReport()

    expect(verify([], BODY, [], report)).toHaveLength(0)
    expect(readingNote(report)).toBe(
      'The model found nothing in this lesson worth asking back.'
    )
  })

  it('still answers nothing at all when it is not asked for a reason', async () => {
    const { verify } = await import('@/lib/llm/clozes')
    // Every existing caller passes three arguments and must go on
    // getting exactly the cards back.
    expect(verify([], BODY, [])).toEqual([])
  })
})
