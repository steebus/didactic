import { describe, it, expect } from 'vitest'
import { toolList } from '@/lib/llm/toolInput'

describe('toolList', () => {
  it('reads a plain array, which is the ordinary case', () => {
    expect(toolList({ groups: [{ title: 'A' }] }, 'groups')).toEqual([{ title: 'A' }])
  })

  /**
   * The fault this exists for. The API answered with the whole input
   * object re-encoded as a string under the field name, `Array.isArray`
   * was false, and `Group these` reported "nothing here groups cleanly"
   * for a bed the model had divided into six groups.
   */
  it('reads a list out of the whole object re-encoded as a string', () => {
    const input = {
      groups: JSON.stringify({
        groups: [
          { title: 'Core Frontend Languages', topic_ids: ['a', 'b'] },
          { title: 'Developer Tooling', topic_ids: ['c'] },
        ],
      }),
    }
    const got = toolList(input, 'groups') as Array<{ title: string }>
    expect(got).toHaveLength(2)
    expect(got[0].title).toBe('Core Frontend Languages')
  })

  it('reads a list out of a string holding just the array', () => {
    const input = { edges: JSON.stringify([{ from: 'a', to: 'b' }]) }
    expect(toolList(input, 'edges')).toEqual([{ from: 'a', to: 'b' }])
  })

  it('is empty for text that is not JSON, rather than throwing', () => {
    expect(toolList({ groups: 'I grouped them for you!' }, 'groups')).toEqual([])
  })

  it('is empty for a shape with no list in it', () => {
    expect(toolList({ groups: JSON.stringify({ note: 'none' }) }, 'groups')).toEqual([])
    expect(toolList({ groups: 42 }, 'groups')).toEqual([])
    expect(toolList({}, 'groups')).toEqual([])
    expect(toolList(null, 'groups')).toEqual([])
  })
})
