import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/**
 * Integration tests wipe the tables to isolate themselves, which also
 * destroys the development fixture the app runs on. This restores it
 * once, after the whole run, so `npm test` does not leave the app
 * looking empty.
 *
 * Silent when the local stack is not running: unit tests must pass
 * without Docker.
 */
export async function teardown() {
  // Piped through stdin rather than a shell redirect: the redirect form
  // is not portable to the Windows shell execSync defaults to.
  const run = (file: string) =>
    execSync('docker exec -i supabase_db_didactic psql -U postgres -q', {
      input: readFileSync(file, 'utf-8'),
      stdio: ['pipe', 'ignore', 'ignore'],
    })

  try {
    run('supabase/seed.sql')
    run('supabase/fixtures/dev-data.sql')
    run('supabase/fixtures/links.sql')
    run('supabase/fixtures/exposures.sql')
    // Ability is a rollup, so the restored exposures have to be folded
    // back into the cached figures.
    execSync('npx vite-node scripts/recompute.ts', { stdio: 'ignore' })
  } catch {
    // No local stack, or no Docker. Nothing to restore.
  }
}
