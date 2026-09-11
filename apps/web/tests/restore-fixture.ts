import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The repo root, from this file rather than from the working directory.
 * `supabase/` and `scripts/` stay at the root while the app sits in
 * `apps/web`, and the runner's cwd is the workspace under turbo and the
 * root under a bare `npx vitest`. Resolving from here is true in both.
 */
const ROOT = join(import.meta.dirname, '..', '..', '..')

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
      input: readFileSync(join(ROOT, file), 'utf-8'),
      stdio: ['pipe', 'ignore', 'ignore'],
    })

  try {
    run('supabase/seed.sql')
    run('supabase/fixtures/dev-data.sql')
    run('supabase/fixtures/links.sql')
    run('supabase/fixtures/exposures.sql')
    // Ability is a rollup, so the restored exposures have to be folded
    // back into the cached figures.
    execSync('npx vite-node scripts/reembed.ts', { cwd: ROOT, stdio: 'ignore' })
    execSync('npx vite-node scripts/recompute.ts', { cwd: ROOT, stdio: 'ignore' })
  } catch {
    // No local stack, or no Docker. Nothing to restore.
  }
}
