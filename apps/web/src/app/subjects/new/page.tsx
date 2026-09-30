import { Suspense } from 'react'
import { requireOwner } from '@/lib/auth'
import { getHomeData } from '@/lib/home'
import { SowSheet } from './SowSheet'

/**
 * `useSearchParams` suspends, and the sheet is the whole page, so the
 * boundary goes here rather than around a fragment of it. Nothing is
 * shown while it resolves: the params are read on the first client
 * render and the fallback is never seen in practice.
 */
export default async function NewSubjectPage() {
  const [, data] = await Promise.all([requireOwner(), getHomeData()])
  return (
    <Suspense fallback={null}>
      <SowSheet fertile={data.fertile} />
    </Suspense>
  )
}
