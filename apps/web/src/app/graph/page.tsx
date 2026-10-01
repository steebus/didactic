import { GraphCanvas } from '@/components/GraphCanvasLoader'
import { requireOwner } from '@/lib/auth'
import { getActivity } from '@/lib/activity'


export default async function GraphPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; topic?: string; sprouting?: string; show?: string }>
}) {
  await requireOwner()
  const { subject, topic, sprouting, show } = await searchParams
  const days = await getActivity()
  return (
    <GraphCanvas
      initialSubject={subject ?? null}
      initialTopic={topic ?? null}
      initialSprouts={sprouting === '1'}
      showResource={show ?? null}
      days={days}
    />
  )
}
