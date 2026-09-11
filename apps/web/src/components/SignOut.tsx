'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './SheetNav.module.css'

/** Closing the catalogue. Printed in the running head with the sheets,
 *  because it is the one navigation that leaves. */
export function SignOut() {
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function leave() {
    setBusy(true)
    await fetch('/api/auth/sign-out', { method: 'POST' }).catch(() => {})
    router.replace('/enter')
    router.refresh()
  }

  return (
    <button type="button" className={styles.leave} onClick={leave} disabled={busy}>
      {busy ? 'Closing…' : 'Close'}
    </button>
  )
}
