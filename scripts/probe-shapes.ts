import { createClient } from '@supabase/supabase-js'
import { shapeUnread } from '../apps/web/src/lib/shape'

/**
 * Read how every topic on the map is written about (063), where it has
 * no standing reading. The topic sheet reads one topic when it is
 * opened; this reads the rest at once.
 *
 *   NODE_OPTIONS=--env-file=apps/web/.env npx vite-node scripts/probe-shapes.ts [limit]
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
const key = process.env.OPENALEX_API_KEY
if (!url || !service || !key) {
  throw new Error('needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and OPENALEX_API_KEY')
}

const db = createClient(url, service, { auth: { persistSession: false } })
const limit = Number(process.argv[2]) || 500
const result = await shapeUnread(db, key, limit)
console.log(`read ${result.read}, failed ${result.failed}, ${result.left} left`)
