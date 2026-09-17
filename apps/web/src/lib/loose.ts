import { cacheLife, cacheTag } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LooseTopic } from '@didactic/core/shapes'
import { tags } from '@didactic/core/tags'
import { supabaseAdmin } from './supabase'
import { EMPTY_EVIDENCE, gatherEvidence } from './evidence'
import { claimsFor, nameClaims } from './filing'

/**
 * Loose stock: every topic filed under no subject at all.
 *
 * They arrive two ways and the sheet cannot tell them apart, which is
 * why it shows what each one holds rather than guessing. Ingestion makes
 * them when a reading matches nothing already sown; taking a topic out
 * of the last bed it sat in makes them too. Either way the topic is real
 * and in the ground, carrying whatever has been read into it, and the
 * only thing missing is somewhere for it to belong.
 *
 * Pending topics are left out. One waiting on an adjudication is not
 * loose — it is a question, it already has a sheet that asks it, and
 * filing or deleting it here would settle by accident something the
 * inbox is deliberately asking.
 */
export async function getLooseStock(): Promise<LooseTopic[]> {
  'use cache'
  cacheTag(tags.topics, tags.subjects)
  cacheLife('held')
  return readLooseStock(supabaseAdmin())
}

export async function readLooseStock(db: SupabaseClient): Promise<LooseTopic[]> {
  const [{ data: topics }, { data: memberships }] = await Promise.all([
    db.from('topics')
      .select('id, title, summary, ability, created_at')
      .eq('state', 'active')
      .order('created_at', { ascending: false }),
    db.from('topic_subjects').select('topic_id'),
  ])

  const filed = new Set((memberships ?? []).map(m => m.topic_id as string))
  const loose = (topics ?? []).filter(t => !filed.has(t.id as string))
  if (loose.length === 0) return []

  const looseIds = loose.map(t => t.id as string)

  const [evidence, routed, claims, { data: subjectRows }] = await Promise.all([
    gatherEvidence(db, looseIds),
    // Which of them carry a route. `044` refuses to change the level of
    // a topic that does, so the sheet has to know before it offers to.
    db.from('curricula').select('topic_id').in('topic_id', looseIds),
    // What the bed says about each one. The sheet only ever shows these
    // and never acts on them: a claim the bed was sure about filed
    // itself when the topic was made, so anything still loose is either
    // under that bar or was taken out of a subject by hand -- and this
    // sheet cannot tell those apart, which is exactly why it asks
    // rather than files.
    claimsFor(db, looseIds),
    db.from('subjects').select('id, title'),
  ])

  const hasRoute = new Set((routed.data ?? []).map(r => r.topic_id as string))
  const subjectTitle = new Map(
    (subjectRows ?? []).map(s => [s.id as string, s.title as string])
  )


  return loose.map(t => ({
    id: t.id as string,
    title: t.title as string,
    summary: (t.summary as string | null) ?? null,
    ability: Number(t.ability),
    created_at: (t.created_at as string | null) ?? null,
    hasRoute: hasRoute.has(t.id as string),
    nearby: nameClaims(claims.get(t.id as string) ?? [], subjectTitle),
    evidence: evidence.get(t.id as string) ?? EMPTY_EVIDENCE,
  }))
}
