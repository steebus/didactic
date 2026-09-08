'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './page.module.css'

/**
 * One form, two jobs. A fresh installation has no account, so the first
 * visit sets one; every visit after that opens the door with it.
 *
 * Which one it is comes from the server — the sheet does not decide for
 * itself, and the claim route checks again before it creates anything.
 */
export function EntryForm({ claimed, next }: { claimed: boolean; next: string | null }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const ready = email.trim().length > 0 && password.length > 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(claimed ? '/api/auth/sign-in' : '/api/auth/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'That does not open it.')

      const destination = next && next.startsWith('/') ? next : '/'
      // Refreshed as well as pushed: every sheet is server-rendered
      // behind the gate, and the router would otherwise serve the
      // redirect it cached while nobody was signed in.
      router.replace(destination)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setBusy(false)
    }
  }

  return (
    <form className={styles.body} onSubmit={submit}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="email">
          Address
        </label>
        <input
          id="email"
          className={styles.input}
          type="email"
          autoComplete="username"
          inputMode="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          autoFocus
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="password">
          {claimed ? 'Key' : 'A key, at least twelve characters'}
        </label>
        <input
          id="password"
          className={styles.input}
          type="password"
          autoComplete={claimed ? 'current-password' : 'new-password'}
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        {!claimed && (
          <p className={styles.hint}>
            This is the only account there will ever be, and there is no way
            back in if you lose it. Put it somewhere you keep such things.
          </p>
        )}
      </div>

      {error && <p className={styles.problem}>{error}</p>}

      <div className={styles.actions}>
        <button className={styles.submit} type="submit" disabled={!ready || busy}>
          {busy
            ? claimed
              ? 'Opening…'
              : 'Claiming…'
            : claimed
              ? 'Open it'
              : 'Claim it'}
        </button>
        <p className={styles.note}>
          {claimed
            ? 'One account, no sharing. The catalogue is nobody else’s business.'
            : 'Claiming closes this form for good.'}
        </p>
      </div>
    </form>
  )
}
