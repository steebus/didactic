/**
 * `next dev` against the cloud project rather than the local stack.
 *
 * The two environments already exist as two files: .env holds the
 * hosted project, .env.local holds the local Supabase. Next reads
 * .env.local first and stops, so .env is only ever the fallback and
 * plain `next dev` is always local. That is the right default -- this
 * is the way to opt out of it for one run.
 *
 * process.env beats every .env file in Next's load order, so the
 * values are pushed into the child's environment rather than into a
 * third .env file that could drift out of step with the other two.
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'

const KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]

let file
try {
  file = readFileSync('.env', 'utf8')
} catch {
  console.error('No .env to read. It holds the hosted project; see .env.example.')
  process.exit(1)
}

// ponytail: a line-at-a-time read, no dotenv. Quoted values and
// multi-line secrets would need the real parser; nothing here has them.
const env = { ...process.env }
const found = []
for (const line of file.split('\n')) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (!match) continue
  const [, key, value] = match
  if (!KEYS.includes(key)) continue
  env[key] = value.trim()
  found.push(key)
}

const missing = KEYS.filter(k => !found.includes(k))
if (missing.length) {
  console.error(`.env is missing ${missing.join(', ')}.`)
  process.exit(1)
}

// Pointing at a local URL here means .env was never filled in with the
// hosted project, and the run would silently be local anyway.
if (/localhost|127\.0\.0\.1/.test(env.NEXT_PUBLIC_SUPABASE_URL)) {
  console.error(
    `.env points at ${env.NEXT_PUBLIC_SUPABASE_URL}, which is the local stack. ` +
      'It should hold the hosted project; use `npm run dev` for local.'
  )
  process.exit(1)
}

console.log(`Cloud: ${env.NEXT_PUBLIC_SUPABASE_URL}`)
console.log('Writes go to the hosted database. Ctrl-C to stop.\n')

spawn('next', ['dev'], { stdio: 'inherit', env, shell: true })
  .on('exit', code => process.exit(code ?? 0))
