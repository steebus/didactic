import type { SupabaseClient } from '@supabase/supabase-js'
import { config } from './config'
import { recomputeAbility } from './scoring'
import type { ExposureDepth, ResourceStatus } from './types'

export const VALID_STATUSES: ResourceStatus[] = ['queued', 'reading', 'consumed', 'abandoned']
export const VALID_DEPTHS: ExposureDepth[] = ['skim', 'read', 'applied']

/**
 * Move a resource through its lifecycle. Only the transition to
 * 'consumed' writes exposures: saving a resource is intent, reading it
 * is evidence.
 */
export async function setResourceStatus(
  db: SupabaseClient,
  resourceId: string,
  status: ResourceStatus,
  depth?: ExposureDepth
) {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`consume: invalid status "${status}"`)
  }
  if (status === 'consumed' && (!depth || !VALID_DEPTHS.includes(depth))) {
    throw new Error('consume: depth is required when consuming')
  }

  const { data: resource, error } = await db.from('resources')
    .update({
      status,
      consumed_at: status === 'consumed' ? new Date().toISOString() : null,
    })
    .eq('id', resourceId)
    .select('*')
    .single()
  if (error) throw error

  if (status !== 'consumed') return { exposuresWritten: 0 }

  const { data: links, error: linkError } = await db.from('resource_topics')
    .select('topic_id, relevance').eq('resource_id', resourceId)
  if (linkError) throw linkError

  let written = 0
  for (const link of links ?? []) {
    await db.from('exposures').insert({
      user_id: resource.user_id,
      topic_id: link.topic_id,
      source: 'resource',
      source_id: resourceId,
      depth,
      ability_delta: link.relevance * config.DEPTH_WEIGHTS[depth!],
      reason: `${depth} of "${resource.title}"`,
    })
    await recomputeAbility(db, link.topic_id)
    written++
  }

  return { exposuresWritten: written }
}
