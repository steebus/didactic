import type { SupabaseClient } from '@supabase/supabase-js'
import { computeFreshness, clusterAggregate } from './scoring'
import type { Resource } from './types'

export interface ClusterCell {
  id: string
  title: string
  colour: string
  count: number
  queuedCount: number
  ability: number
  freshness: number
  /** Mean confidence across members. Drives how vaguely the sheet
   *  prints the viability figure — see PRODUCT.md principle 4. */
  confidence: number
  /** Most recent exposure across members, or null when no member has
   *  ever been tended. Null is what makes the 'unsown' state
   *  reachable for a populated cluster. */
  lastExposureAt: string | null
}

export interface NodeSummary {
  id: string
  title: string
  ability: number
  confidence: number
  freshness: number
  cluster_id: string | null
}

export interface HomeData {
  clusters: ClusterCell[]
  unclustered: NodeSummary[]
  hot: NodeSummary[]
  cold: NodeSummary[]
  queued: Resource[]
  pendingCount: number
  suggested: NodeSummary | null
  totals: { nodes: number; clusters: number; resources: number }
}

export async function getHomeData(db: SupabaseClient): Promise<HomeData> {
  const [{ data: nodes }, { data: clusters }, { data: resources }, { data: links }] =
    await Promise.all([
      db.from('nodes').select('*'),
      db.from('clusters').select('*'),
      db.from('resources').select('*').order('added_at', { ascending: false }),
      db.from('resource_nodes').select('resource_id, node_id'),
    ])

  const all = (nodes ?? []).map(n => ({
    ...n,
    ability: Number(n.ability),
    ability_confidence: Number(n.ability_confidence),
    freshness: computeFreshness(n.last_exposure_at, Number(n.ability)),
  }))

  const active = all.filter(n => n.state === 'active')
  const pendingCount = all.length - active.length

  const summary = (n: (typeof all)[number]): NodeSummary => ({
    id: n.id,
    title: n.title,
    ability: n.ability,
    confidence: n.ability_confidence,
    freshness: n.freshness,
    cluster_id: n.cluster_id,
  })

  // Queued resources per cluster: where material has been stockpiled
  // but not read. This is the "unsown stock" signal.
  const queuedResources = (resources ?? []).filter(r => r.status === 'queued')
  const queuedIds = new Set(queuedResources.map(r => r.id))
  const queuedNodeIds = new Set(
    (links ?? []).filter(l => queuedIds.has(l.resource_id)).map(l => l.node_id)
  )

  const clusterCells: ClusterCell[] = (clusters ?? []).map(c => {
    const members = active.filter(n => n.cluster_id === c.id)
    const tended = members
      .map(n => n.last_exposure_at)
      .filter((d): d is string => d !== null)
      .sort()
    return {
      id: c.id,
      title: c.title,
      colour: c.colour,
      count: members.length,
      queuedCount: members.filter(n => queuedNodeIds.has(n.id)).length,
      confidence: members.length
        ? members.reduce((s, n) => s + n.ability_confidence, 0) / members.length
        : 0,
      lastExposureAt: tended.at(-1) ?? null,
      ...clusterAggregate(members),
    }
  }).sort((a, b) => b.count - a.count)

  const hot = [...active]
    .filter(n => n.freshness > 0)
    .sort((a, b) => b.freshness - a.freshness)
    .slice(0, 5)
    .map(summary)

  // Cold means known enough to be worth keeping, but fading. A node
  // never touched is not cold, it is unsown.
  const cold = active
    .filter(n => n.ability >= 2 && n.freshness < 0.4 && n.last_exposure_at !== null)
    .sort((a, b) => a.freshness - b.freshness)
    .slice(0, 5)
    .map(summary)

  return {
    clusters: clusterCells,
    unclustered: active.filter(n => n.cluster_id === null).map(summary),
    hot,
    cold,
    queued: queuedResources,
    pendingCount,
    suggested: cold[0] ?? null,
    totals: {
      nodes: active.length,
      clusters: clusterCells.length,
      resources: (resources ?? []).length,
    },
  }
}
