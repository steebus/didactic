import { describe, it, expect } from 'vitest'
import { mentionAt, tagsIn, tagHref, tagMarkdown, readTagHref, MENTION_CEILING } from '@/lib/mentions'
import { rankMentions, mentionRank } from '@/lib/mentionSearch'

const ID = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
const OTHER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

describe('the name being typed at the cursor', () => {
  it('opens on the bare @, before there is anything to filter by', () => {
    expect(mentionAt('It is about @', 13)).toEqual({ query: '', from: 12, to: 13 })
  })

  it('is everything typed since the @', () => {
    expect(mentionAt('about @settle', 13)?.query).toBe('settle')
  })

  it('keeps going through a space, because a title is several words', () => {
    expect(mentionAt('about @order rout', 17)?.query).toBe('order rout')
  })

  it('is only what is behind the cursor, not the rest of the line', () => {
    expect(mentionAt('about @set and more', 10)?.query).toBe('set')
  })

  it('is not an email address', () => {
    expect(mentionAt('steve@example.com', 17)).toBeNull()
  })

  it('is not an @ buried in a word', () => {
    expect(mentionAt('a@b', 3)).toBeNull()
  })

  it('starts after an opening bracket or a quote as well as a space', () => {
    expect(mentionAt('("@set', 6)?.query).toBe('set')
    expect(mentionAt('@set', 4)?.query).toBe('set')
  })

  it('gives up once the reader has plainly moved on', () => {
    expect(mentionAt(`@${'x'.repeat(MENTION_CEILING + 1)}`, MENTION_CEILING + 2)).toBeNull()
    expect(mentionAt('@set\nand then', 13)).toBeNull()
  })
})

describe('a tag in a note', () => {
  it('points at the thing\'s own address, so it is just a link', () => {
    expect(tagHref('topic', ID)).toBe(`/topics/${ID}`)
    expect(tagHref('lesson', ID)).toBe(`/lesson/${ID}`)
    expect(tagMarkdown('topic', ID, 'Settlement')).toBe(`[@Settlement](/topics/${ID})`)
  })

  it('cannot be broken by a title that carries brackets', () => {
    expect(tagMarkdown('topic', ID, 'Custody [and more]')).toBe(
      `[@Custody and more](/topics/${ID})`
    )
  })

  it('is read back out of the note it was written in', () => {
    expect(tagsIn(`A thought about [@Settlement](/topics/${ID}) after [@A lesson](/lesson/${OTHER}).`))
      .toEqual([
        { kind: 'topic', id: ID },
        { kind: 'lesson', id: OTHER },
      ])
  })

  it('is one tag however many times the note names it', () => {
    expect(tagsIn(`[@A](/topics/${ID}) and again [@A](/topics/${ID})`)).toHaveLength(1)
  })

  it('is nothing where the link is not one', () => {
    expect(tagsIn('[a link out](https://example.com)')).toEqual([])
    expect(tagsIn('[the marked sheet](/marked)')).toEqual([])
    expect(tagsIn('[not an id](/topics/settlement)')).toEqual([])
    expect(readTagHref('/topics/../../etc')).toBeNull()
  })
})

describe('ordering what an @ could mean', () => {
  const topic = (title: string) => ({ kind: 'topic' as const, id: title, title })
  const lesson = (title: string) => ({ kind: 'lesson' as const, id: title, title })

  it('puts what starts with the typing before what merely contains it', () => {
    const ranked = rankMentions('set', [topic('Asset offsetting'), topic('Settlement')], [])
    expect(ranked.map(s => s.title)).toEqual(['Settlement', 'Asset offsetting'])
  })

  it('reaches a word inside a title before one buried mid-word', () => {
    expect(mentionRank('cust', 'Brokerage custody')).toBeLessThan(
      mentionRank('cust', 'Encrustation')
    )
  })

  it('offers the topic before the lesson when both fit equally', () => {
    const ranked = rankMentions('settle', [topic('Settlement')], [lesson('Settlement')])
    expect(ranked[0].kind).toBe('topic')
  })

  it('drops what does not answer what was typed at all', () => {
    expect(rankMentions('zzz', [topic('Settlement')], [])).toEqual([])
  })

  it('offers everything it was given when nothing has been typed yet', () => {
    expect(rankMentions('', [topic('Settlement')], [lesson('A lesson')])).toHaveLength(2)
  })

  it('never offers more than the menu can print', () => {
    const many = Array.from({ length: 30 }, (_, i) => topic(`Topic ${i}`))
    expect(rankMentions('topic', many, [])).toHaveLength(8)
  })
})
