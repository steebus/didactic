import { describe, it, expect } from 'vitest'
import { edgeLine } from '../src/graph'

describe('captioning an edge', () => {
  it('names each of the four claims between topics', () => {
    expect(['prereq', 'related', 'specialises', 'alternative'].map(edgeLine)).toEqual([
      'sow first', 'grows with', 'broader than', 'instead of',
    ])
  })

  it('says nothing on the lines that are not claims', () => {
    for (const kind of ['covers', 'teaches', 'marked in', 'about']) expect(edgeLine(kind)).toBeNull()
  })
})
