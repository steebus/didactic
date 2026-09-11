import { describe, it, expect, vi, beforeEach } from 'vitest'

// The gate's two paths are told apart by what the request carries, so
// the test supplies headers and cookies rather than a whole request.
const mockHeaders = vi.fn()
const mockCookies = vi.fn(() => ({ getAll: () => [], set: () => {} }))
vi.mock('next/headers', () => ({
  headers: async () => mockHeaders(),
  cookies: async () => mockCookies(),
}))

// The cookie client and the anon client are the two ends of the branch.
const mockCookieGetUser = vi.fn()
const mockTokenGetUser = vi.fn()
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: mockCookieGetUser } }),
}))
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({}),
  supabaseBrowser: () => ({ auth: { getUser: mockTokenGetUser } }),
}))

const owner = { id: 'owner-uuid', email: 'owner@example.com' }

beforeEach(() => {
  vi.resetModules()
  mockHeaders.mockReset()
  mockCookieGetUser.mockReset()
  mockTokenGetUser.mockReset()
  mockHeaders.mockReturnValue(new Headers())
  mockCookieGetUser.mockResolvedValue({ data: { user: null } })
  mockTokenGetUser.mockResolvedValue({ data: { user: null } })
})

describe('getOwner with a bearer token', () => {
  it('accepts a valid token, and does not consult the cookies', async () => {
    mockHeaders.mockReturnValue(new Headers({ authorization: 'Bearer good-jwt' }))
    mockTokenGetUser.mockResolvedValue({ data: { user: owner } })

    const { getOwner } = await import('@/lib/auth')
    expect(await getOwner()).toEqual(owner)
    // The token is the whole claim; reading cookies as well would let a
    // stale web session answer for a phone request.
    expect(mockTokenGetUser).toHaveBeenCalledWith('good-jwt')
    expect(mockCookieGetUser).not.toHaveBeenCalled()
  })

  it('refuses an expired token rather than falling back to the cookies', async () => {
    mockHeaders.mockReturnValue(new Headers({ authorization: 'Bearer expired-jwt' }))
    mockTokenGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'JWT expired' },
    })
    // A signed-in browser session that must not rescue a bad token.
    mockCookieGetUser.mockResolvedValue({ data: { user: owner } })

    const { getOwner } = await import('@/lib/auth')
    expect(await getOwner()).toBeNull()
    expect(mockCookieGetUser).not.toHaveBeenCalled()
  })

  it('falls through to the cookie session when there is no header', async () => {
    mockCookieGetUser.mockResolvedValue({ data: { user: owner } })

    const { getOwner } = await import('@/lib/auth')
    expect(await getOwner()).toEqual(owner)
    expect(mockTokenGetUser).not.toHaveBeenCalled()
  })

  it('ignores an authorization header that is not a bearer token', async () => {
    // Basic auth, or a malformed header, is not a claim this gate reads;
    // it must not be mistaken for one and must not short-circuit cookies.
    mockHeaders.mockReturnValue(new Headers({ authorization: 'Basic abc123' }))
    mockCookieGetUser.mockResolvedValue({ data: { user: owner } })

    const { getOwner } = await import('@/lib/auth')
    expect(await getOwner()).toEqual(owner)
    expect(mockTokenGetUser).not.toHaveBeenCalled()
  })
})
