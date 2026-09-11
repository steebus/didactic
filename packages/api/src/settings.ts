import type { Api } from './client'

/**
 * Nothing yet — Phase 3 gives the sheet something to hold. It exists so
 * the address and its client function are there to grow into.
 */
export const settings = (api: Api) => ({
  read: () => api.get<Record<string, never>>('/api/settings'),
})
