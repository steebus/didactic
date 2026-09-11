import type { Api } from './client'

/**
 * Web only. The phone signs in against Supabase directly and sends the
 * token it gets back as a bearer header; there is no cookie for these
 * to set on a native client.
 */
export const auth = (api: Api) => ({
  claim: (email: string, password: string) =>
    api.post<{ ok: true }>('/api/auth/claim', { email, password }),
  signIn: (email: string, password: string) =>
    api.post<{ ok: true }>('/api/auth/sign-in', { email, password }),
  signOut: () => api.post<{ ok: true }>('/api/auth/sign-out'),
})
