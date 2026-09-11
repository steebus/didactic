import { describe, it, expect } from 'vitest'
import { lessonRoster, lessonSlug, resolveLesson, LESSON_SCHEME } from '../src/lessonLinks'

const lesson = (title: string, id: string, topicTitle: string | null, here = true) => ({
  id, title, topicTitle, here,
})

describe('naming a lesson', () => {
  it('is the title, slugged the way a heading is', () => {
    expect(lessonSlug('Settlement and custody')).toBe('settlement-and-custody')
    expect(lessonSlug('Why now? (and not later)')).toBe('why-now-and-not-later')
  })

  it('takes a name and nothing that is not one', () => {
    expect(LESSON_SCHEME.exec('lesson:settlement-and-custody')?.[1]).toBe('settlement-and-custody')
    expect(LESSON_SCHEME.test('https://example.com')).toBe(false)
    expect(LESSON_SCHEME.test('lesson:')).toBe(false)
    // Nothing that could carry a path or a second scheme through.
    expect(LESSON_SCHEME.test('lesson:../../etc')).toBe(false)
    expect(LESSON_SCHEME.test('lesson:javascript:alert(1)')).toBe(false)
  })
})

describe('the roster', () => {
  it('reaches a lesson by the name of its title', () => {
    const roster = lessonRoster([lesson('Settlement and custody', 'abc', 'Brokerage')])

    expect(resolveLesson(roster, 'settlement-and-custody')).toEqual({
      href: '/lesson/abc',
      label: 'Settlement and custody',
    })
  })

  it('says where a lesson outside the topic sits, before the press', () => {
    const roster = lessonRoster([lesson('Worked example', 'far', 'Order routing', false)])

    expect(resolveLesson(roster, 'worked-example')?.label).toBe(
      'Worked example — in Order routing'
    )
  })

  it('gives a name two lessons answer to to the nearer one', () => {
    // "Worked example" under three routes of one subject is ordinary.
    const roster = lessonRoster([
      lesson('Worked example', 'far', 'Order routing', false),
      lesson('Worked example', 'near', 'Brokerage', true),
    ])

    expect(resolveLesson(roster, 'worked-example')?.href).toBe('/lesson/near')
  })

  it('answers to nothing it has never been told about', () => {
    expect(resolveLesson(lessonRoster([]), 'settlement-and-custody')).toBeNull()
  })
})
