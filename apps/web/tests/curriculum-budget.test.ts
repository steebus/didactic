import { describe, it, expect } from 'vitest'
import { lessonCount } from '@/lib/llm/curriculum'
import { routeBudget } from '@didactic/core/grain'

/**
 * The route is drafted to the reader's distance from their target, not
 * to a range the model picks from. The model writes the lessons; it does
 * not choose how many.
 */
describe('lessonCount', () => {
  it('keeps the old range where there is no budget', () => {
    expect(lessonCount(null)).toBe('8 to 16 lessons.')
  })

  it('asks for the budget, says what it comes from, and how to argue past it', () => {
    const said = lessonCount({ ...routeBudget(12), hours: 13.9, from: 3, target: 4 })
    expect(said).toMatch(/^12 lessons: that is what taking them from 3 to depth 4 comes to, about 14 hours/)
    expect(said).toMatch(/between 9 and 15/)
    expect(said).toMatch(/"Budget:"/)
  })

  it('asks for a short route that keeps a topic already at its target', () => {
    expect(lessonCount({ ...routeBudget(0), hours: 0, from: 3.2, target: 3 })).toMatch(/^3 lessons: they are already at the depth they want \(3\)/)
  })
})
