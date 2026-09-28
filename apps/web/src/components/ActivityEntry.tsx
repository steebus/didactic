import type { ReactNode } from 'react'
import { getActivity } from '@/lib/activity'
import { ActivityRule } from './ActivityRule'

/**
 * The rule under a sheet's head, read and drawn. Rendered inside a
 * `Suspense` whose fallback is the sheet's plain rule, and hands that
 * same rule back where there is no year to draw yet.
 */
export async function ActivityEntry({
  scope,
  plain,
  ...inks
}: {
  scope?: { subject: string } | { topic: string }
  plain: ReactNode
  colours?: Record<string, string>
  stemInk?: string
  cellInk?: string
}) {
  const days = await getActivity(scope)
  if (!days.length) return plain
  return <ActivityRule days={days} {...inks} />
}
