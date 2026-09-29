import type { SupabaseClient } from '@supabase/supabase-js'
import type { IngestStep, TimedStep } from '@didactic/core/ingestProgress'

/**
 * Keeps what one attempt at reading a resource has done, on its job row,
 * for the send sheet to print as it happens (`core/ingestProgress`).
 *
 * The list is held here and written whole each time, so an attempt starts
 * with an empty one and a retry never prints a failed attempt's steps.
 *
 * Never fatal, and never throws: the reading is the work and this is
 * the commentary on it. Before 068 there is no column to write, and the
 * update fails quietly into the log.
 */
export function progressLog(db: SupabaseClient, resourceId: string) {
  const steps: TimedStep[] = []
  return async (step: IngestStep): Promise<void> => {
    steps.push({ ...step, at: new Date().toISOString() })
    try {
      const { error } = await db
        .from('ingestion_jobs')
        .update({ progress: steps })
        .eq('resource_id', resourceId)
      if (error) console.error('ingest: could not note progress', error.message)
    } catch (e) {
      console.error('ingest: could not note progress', e instanceof Error ? e.message : e)
    }
  }
}

/** How many words a text runs to, for the line that says it was fetched. */
export const wordsIn = (text: string | null | undefined) =>
  text ? text.split(/\s+/).filter(Boolean).length : 0
