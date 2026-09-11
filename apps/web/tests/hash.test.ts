import { describe, it, expect } from 'vitest'
import { setHash } from '@/lib/hash'

/**
 * The contents list travels to a heading and leaves the section's name
 * in the address bar. Doing that through the app router's patched
 * `replaceState` is read as a URL changed behind its back, and the
 * router answers with a history traversal: the route's data is spawned
 * again and the sheet blinks through its loading state on the way to a
 * scroll. What is under test is that the write goes past the patch,
 * and that it is skipped rather than forced where it cannot.
 */
function fakeHistory(state: unknown) {
  const wrote: Array<{ state: unknown; url: string | URL | null | undefined }> = []
  return {
    wrote,
    history: {
      state,
      replaceState(next: unknown, _unused: string, url?: string | URL | null) {
        wrote.push({ state: next, url })
      },
    } as unknown as History,
  }
}

describe('setHash', () => {
  it('writes the hash carrying the state the router put there', () => {
    const tree = { some: 'tree' }
    const { history, wrote } = fakeHistory({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: tree })

    expect(setHash('#what-it-costs', history)).toBe(true)
    expect(wrote).toHaveLength(1)
    expect(wrote[0].url).toBe('#what-it-costs')
    // Handed back whole: the router's own escape hatch is a call that
    // carries its state, and the entry keeps the tree it was written
    // with rather than losing it to a bare object.
    expect(wrote[0].state).toMatchObject({
      __NA: true,
      __PRIVATE_NEXTJS_INTERNALS_TREE: tree,
    })
  })

  it('leaves the address bar alone rather than navigating for a hash', () => {
    // No router state yet, or a router that has stopped marking its
    // entries. Either way a write here is the flash, so there is none.
    for (const state of [null, undefined, {}, { __NA: false }]) {
      const { history, wrote } = fakeHistory(state)
      expect(setHash('#anything', history)).toBe(false)
      expect(wrote).toHaveLength(0)
    }
  })
})
