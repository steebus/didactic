import { GraphCanvas } from '@/components/GraphCanvasLoader'

export const dynamic = 'force-dynamic'

export default async function GraphPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; topic?: string }>
}) {
  const { subject, topic } = await searchParams
  return <GraphCanvas initialSubject={subject ?? null} initialTopic={topic ?? null} />
}
