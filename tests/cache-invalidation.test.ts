import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Every write drops what it changed.
 *
 * This is a source check rather than a behaviour test because the
 * failure it guards is silent: a route that writes without dropping
 * its tags does not error, it just serves yesterday's map -- the worst
 * possible outcome for an app whose whole claim is being an honest
 * record. A wrong number nobody is told about is worse than a slow one.
 */
function routeFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...routeFiles(path))
    else if (entry === 'route.ts') out.push(path)
  }
  return out
}

const MUTATES = /export async function (POST|PATCH|PUT|DELETE)\b/

/**
 * Routes that write nothing the sheets read.
 *
 * Auth writes cookies and a session, which no cached function is built
 * from; qualify asks the model for questions and stores nothing.
 */
const NO_CACHED_READS = ['auth', 'qualify']

describe('cache invalidation', () => {
  const routes = routeFiles(join(process.cwd(), 'src', 'app', 'api'))

  it('finds the route handlers', () => {
    expect(routes.length).toBeGreaterThan(10)
  })

  it.each(
    routes
      .filter(p => MUTATES.test(readFileSync(p, 'utf8')))
      .filter(p => !NO_CACHED_READS.some(skip => p.includes(skip)))
      .map(p => [p.split('api')[1].replace(/\\/g, '/'), p] as const)
  )('%s drops its cache tags', (_name, path) => {
    const source = readFileSync(path, 'utf8')
    expect(source).toContain('revalidateTag')
    // Defined and called: a helper nobody invokes is the exact shape of
    // this bug.
    const calls = source.split('dropCache()').length - 1
    expect(calls).toBeGreaterThan(1)
  })
})
