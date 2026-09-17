import type { SupabaseClient } from '@supabase/supabase-js'
import { filingClaims, type FilingClaim } from '@didactic/core/filing'
import type { LooseClaim } from '@didactic/core/shapes'

/**
 * Where the bed says a topic belongs, for topics filed under nothing.
 *
 * The maths is in `@didactic/core/filing`; what stays here is the two
 * reads it needs, which is why it cannot follow. One query for the
 * edges, one for where those neighbours sit -- not one pair per topic,
 * because this runs over a whole ingestion and over the loose sheet.
 */
export async function claimsFor(
  db: SupabaseClient,
  topicIds: string[]
): Promise<Map<string, FilingClaim[]>> {
  const claims = new Map<string, FilingClaim[]>()
  if (topicIds.length === 0) return claims

  const { data: edges } = await db
    .from('edges')
    .select('from_topic, to_topic')
    .or(`from_topic.in.(${topicIds.join(',')}),to_topic.in.(${topicIds.join(',')})`)

  const wanted = new Set(topicIds)
  const neighbours = new Map<string, Set<string>>()
  for (const edge of edges ?? []) {
    for (const [mine, theirs] of [
      [edge.from_topic, edge.to_topic],
      [edge.to_topic, edge.from_topic],
    ] as const) {
      // A pair of loose topics joined to each other is two entries, one
      // on each of them, and neither is evidence for the other.
      if (!wanted.has(mine) || mine === theirs) continue
      const held = neighbours.get(mine) ?? new Set<string>()
      held.add(theirs)
      neighbours.set(mine, held)
    }
  }

  const everyNeighbour = [...new Set([...neighbours.values()].flatMap(s => [...s]))]
  if (everyNeighbour.length === 0) return claims

  const { data: memberships } = await db
    .from('topic_subjects').select('topic_id, subject_id').in('topic_id', everyNeighbour)

  const subjectsOf = new Map<string, string[]>()
  for (const row of memberships ?? []) {
    const held = subjectsOf.get(row.topic_id as string) ?? []
    held.push(row.subject_id as string)
    subjectsOf.set(row.topic_id as string, held)
  }

  for (const [topicId, theirs] of neighbours) {
    const found = filingClaims([...theirs].map(n => subjectsOf.get(n) ?? []))
    if (found.length > 0) claims.set(topicId, found)
  }
  return claims
}

/**
 * File the topics the bed is sure about, and say which.
 *
 * Only ever called on topics that have just been made loose by the app
 * itself -- a fresh ingestion once its edges are drawn, and a topic
 * kept from the inbox. Never as a sweep over loose stock, and that is
 * the whole of why: taking a topic out of its last subject is a
 * deliberate act that leaves no trace in the schema, so a sweep could
 * not tell it from a topic that was never filed and would quietly put
 * back everything anyone had ever taken out.
 *
 * Anything already filed is skipped, asked now rather than trusted from
 * the caller.
 */
export async function fileWhatTheBedIsSureOf(
  db: SupabaseClient,
  topicIds: string[]
): Promise<Array<{ topicId: string; subjectId: string }>> {
  if (topicIds.length === 0) return []

  const { data: filed } = await db
    .from('topic_subjects').select('topic_id').in('topic_id', topicIds)
  const already = new Set((filed ?? []).map(r => r.topic_id as string))
  const loose = topicIds.filter(id => !already.has(id))
  if (loose.length === 0) return []

  const claims = await claimsFor(db, loose)
  const rows = [...claims].flatMap(([topicId, found]) =>
    found
      .filter(claim => claim.standing === 'settled')
      .map(claim => ({ topicId, subjectId: claim.subjectId }))
  )
  if (rows.length === 0) return []

  const { error } = await db.from('topic_subjects').upsert(
    rows.map(r => ({ topic_id: r.topicId, subject_id: r.subjectId, created_by: 'ai' as const })),
    { onConflict: 'topic_id,subject_id', ignoreDuplicates: true }
  )
  if (error) throw error
  return rows
}

/**
 * The claims a sheet prints, with each subject named.
 *
 * A claim carries subject ids, because the rule is about ids; a sheet
 * needs the titles. Answers empty for a topic that is filed somewhere
 * already -- a topic with a home is not looking for one, and printing
 * where it might otherwise have gone would be a sheet second-guessing a
 * filing nobody asked it about.
 */
export async function nearbyFor(
  db: SupabaseClient,
  topicId: string,
  filedUnder: number
): Promise<LooseClaim[]> {
  if (filedUnder > 0) return []

  const [claims, { data: subjectRows }] = await Promise.all([
    claimsFor(db, [topicId]),
    db.from('subjects').select('id, title'),
  ])

  const title = new Map((subjectRows ?? []).map(s => [s.id as string, s.title as string]))
  return nameClaims(claims.get(topicId) ?? [], title)
}

/**
 * A claim as a sheet prints it: the subject named, and the share back as
 * the two counts it came from.
 *
 * "0.67 of its neighbours" is a figure nobody can check. "2 of its 3" is
 * the same claim and is the reasoning itself, which is the only thing
 * that lets a reader disagree with it.
 *
 * A subject the map has no title for is dropped rather than printed as
 * a claim about nothing.
 */
export function nameClaims(
  claims: FilingClaim[],
  title: Map<string, string>
): LooseClaim[] {
  return claims.flatMap(claim => {
    const subjectTitle = title.get(claim.subjectId)
    if (!subjectTitle) return []
    return [{
      subjectId: claim.subjectId,
      subjectTitle,
      agreeing: claim.agreeing,
      ofFiled: Math.round(claim.agreeing / claim.share),
    }]
  })
}
