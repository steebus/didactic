/**
 * The bed read as groups rather than as one list.
 *
 * Grouping is the second axis the order could never carry: subject
 * matter across, complexity down. A flat bed of thirty topics runs one
 * ramp from introductory to advanced and says nothing about which of
 * them are about the same thing, which is the question a reader
 * standing in a subject actually asks.
 *
 * Pure, and here rather than in `apps/web`, because the phone draws the
 * same bed. What reaches the database stays in the app.
 */

import type { TopicTreeNode } from './subject'
import { orderSubjectOutline } from './outline'

export interface TopicGroup {
  id: string
  title: string
  position: number
}

/**
 * One band of the bed: a named group with its topics, or the loose
 * topics between two groups.
 *
 * A loose band carries no group and is drawn without a box. It is not a
 * nameless group and must never be given a name in the UI — "the rest"
 * is a claim about the bed that the reader never made.
 */
export interface BedBand {
  group: TopicGroup | null
  topics: TopicTreeNode[]
}

/**
 * Gather an ordered bed into its bands, keeping the order the outline
 * already decided.
 *
 * The topics are ordered first and grouped second, never the other way
 * round: `orderSubjectOutline` is the one place that knows what is
 * being worked and where the bed put each topic, and re-sorting inside
 * a group would quietly overrule it.
 *
 * A group's place in the list is its `position`. Loose topics keep
 * theirs relative to the groups — a topic the bed put first prints
 * above the first box rather than being swept to the bottom — which is
 * what makes "not everything is grouped" read as an ordinary state of
 * the bed rather than as a leftovers pile.
 *
 * An empty group survives: a box you have just made and not yet filled
 * is the normal way one gets made, and dropping it on the next read
 * would delete the reader's work under them.
 */
export function bandsOfBed(
  tree: TopicTreeNode[],
  groups: TopicGroup[]
): BedBand[] {
  const ordered = orderSubjectOutline(tree)
  const byPosition = [...groups].sort(
    (a, b) => a.position - b.position || a.title.localeCompare(b.title)
  )
  const known = new Map(byPosition.map(g => [g.id, g]))

  // A box sits where its `position` says, not where its contents happen
  // to fall in the topic order.
  //
  // It used to be the other way round -- the band was emitted the first
  // time one of its topics came up -- which read as reasonable and made
  // the group nudge do nothing at all: `position` changed, the write
  // landed, and the band stayed put because the topic that opened it had
  // not moved. Position is the only thing a reader can address a *group*
  // by, so it has to be what orders them.
  const bands: BedBand[] = []

  // Where each group's members sit, gathered once.
  const membersOf = new Map<string, TopicTreeNode[]>()
  const loose: TopicTreeNode[] = []
  for (const node of ordered) {
    const id = node.topic.group_id
    // A topic naming a group this bed does not have is loose, not lost.
    if (!id || !known.has(id)) {
      loose.push(node)
      continue
    }
    const held = membersOf.get(id)
    if (held) held.push(node)
    else membersOf.set(id, [node])
  }

  // Every group in its own order, empty ones included: a box made and
  // not yet filled is waiting for the reader, so it has to be visible to
  // be filled.
  for (const group of byPosition) {
    bands.push({ group, topics: membersOf.get(group.id) ?? [] })
  }

  // The ungrouped topics, as one band after the boxes. They have no
  // position of their own to sit at -- `topic_subjects.position` orders
  // topics within the whole bed, and the boxes are ordered by their own
  // sequence -- so the honest place for them is the end, where they read
  // as "everything else" rather than as a group that lost its name.
  if (loose.length > 0) bands.push({ group: null, topics: loose })

  return bands
}

/**
 * Move one item up or down among its siblings, answering the new order
 * as a list of ids.
 *
 * Positions are rewritten as 0..n-1 over the whole list rather than
 * swapped in place, because the list being reordered has never been
 * guaranteed to hold distinct positions: a bed sown before `033`, or
 * one grown by hand, is full of nulls and ties. Renumbering makes the
 * move mean the same thing whatever it started from.
 *
 * A move off either end is a no-op rather than an error. The button is
 * disabled there, and a keyboard or a double press should do nothing
 * rather than fail.
 */
export function moveWithin<T extends { id: string }>(
  items: T[],
  id: string,
  direction: 'up' | 'down'
): string[] {
  const order = items.map(i => i.id)
  const at = order.indexOf(id)
  if (at === -1) return order
  const to = direction === 'up' ? at - 1 : at + 1
  if (to < 0 || to >= order.length) return order
  const moved = [...order]
  ;[moved[at], moved[to]] = [moved[to], moved[at]]
  return moved
}
