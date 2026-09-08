/**
 * Connection details for the local Supabase stack.
 *
 * The port lives here rather than in each test file: Windows reserves
 * shifting port ranges on reboot, so it has already had to move once and
 * will again.
 */
export const LOCAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54600'

export const LOCAL_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

export const DEV_USER = '11111111-1111-1111-1111-111111111111'

/** True when the local stack answers. Integration tests skip without it. */
export async function localDbReachable() {
  return fetch(`${LOCAL_URL}/rest/v1/`, { signal: AbortSignal.timeout(2000) })
    .then(r => r.ok || r.status === 400 || r.status === 404)
    .catch(() => false)
}
