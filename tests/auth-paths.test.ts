import { describe, it, expect } from 'vitest'
import { isOpenPath, isApiPath } from '@/lib/auth-paths'

describe('isOpenPath', () => {
  it('opens the sign-in sheet and the calls it makes', () => {
    expect(isOpenPath('/enter')).toBe(true)
    expect(isOpenPath('/api/auth/sign-in')).toBe(true)
    expect(isOpenPath('/api/auth/claim')).toBe(true)
  })

  it('opens the queue worker, which carries its own key and no session', () => {
    expect(isOpenPath('/api/internal/ingest')).toBe(true)
  })

  it('opens the asset routes the sign-in sheet is printed with', () => {
    expect(isOpenPath('/_next/static/chunk.js')).toBe(true)
    expect(isOpenPath('/icon.png')).toBe(true)
  })

  it('closes everything the catalogue is made of', () => {
    for (const path of [
      '/',
      '/graph',
      '/inbox',
      '/subjects/new',
      '/subjects/abc',
      '/topics/abc',
      '/api/topics',
      '/api/subjects',
      '/api/resources',
      '/api/resources/upload',
    ]) {
      expect(isOpenPath(path), path).toBe(false)
    }
  })

  it('does not open a path that merely starts with an open name', () => {
    // The gate matches whole segments, so a route named to look like the
    // door does not become one.
    expect(isOpenPath('/entertainment')).toBe(false)
    expect(isOpenPath('/enter-the-void')).toBe(false)
  })

  it('does not open a path that only contains an open prefix later on', () => {
    expect(isOpenPath('/subjects/enter')).toBe(false)
    expect(isOpenPath('/api/topics/api/auth/')).toBe(false)
  })
})

describe('isApiPath', () => {
  it('marks API routes, which want a 401 rather than a redirect', () => {
    expect(isApiPath('/api/topics')).toBe(true)
    expect(isApiPath('/api')).toBe(false)
    expect(isApiPath('/graph')).toBe(false)
  })
})
