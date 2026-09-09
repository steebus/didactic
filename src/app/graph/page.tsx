import { GraphCanvas } from '@/components/GraphCanvasLoader'
import { requireOwner } from '@/lib/auth'


export default async function GraphPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; topic?: string }>
}) {
  await requireOwner()
  const { subject, topic } = await searchParams
  return <GraphCanvas initialSubject={subject ?? null} initialTopic={topic ?? null} />
}
