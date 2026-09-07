import { GraphCanvas } from '@/components/GraphCanvasLoader'

export const dynamic = 'force-dynamic'

export default async function GraphPage({
  searchParams,
}: {
  searchParams: Promise<{ cluster?: string; node?: string }>
}) {
  const { cluster, node } = await searchParams
  return <GraphCanvas initialCluster={cluster ?? null} initialNode={node ?? null} />
}
