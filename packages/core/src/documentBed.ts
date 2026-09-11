/**
 * Turning a document's own structure into the shape of a bed.
 *
 * This is what "to the letter" actually means in code. The chapters
 * become the topics, in the document's order; a section under a chapter
 * becomes a topic nested under that chapter's topic; and one chapter
 * following another becomes the claim that the first comes before the
 * second, because that is what a book is asserting by putting them in
 * that order.
 *
 * The nesting is expressed the way the subject sheet already reads
 * nesting -- `specialises` and `prereq` edges (see `subject.ts`) -- so a
 * bed sown from a document draws exactly like any other bed rather than
 * being a second kind of thing the outline has to know about.
 *
 * What this deliberately does not do is name anything. A chapter title
 * is a label in a book, not a concept on a map: "Getting started",
 * "Putting it all together" and "Where next" are all real chapter
 * titles and none of them is something a person can be said to know.
 * Naming stays with the resolver, which is what lets a topic be shared
 * across every subject it sits under. This module fixes the set, the
 * order and the nesting, and nothing else.
 */

import type { OutlineEntry } from './passages'

/**
 * How deep a bed will go, however deep the document does.
 *
 * A technical manual's bookmark tree can run five levels into
 * individual function signatures. Two is a chapter and its sections,
 * which is a bed; four is an index, which is not.
 */
export const MAX_DEPTH = 2

/**
 * The most topics a document may impose.
 *
 * "To the letter" overrides how far the user said they wanted to go --
 * that is the point of it -- but not without limit: a reference work
 * with two hundred bookmarked sections would lay out a bed nobody can
 * read and spend an embedding on each. Past this, only the top level is
 * taken, which is the honest reduction: the chapters, without their
 * sections.
 */
export const MAX_TOPICS = 60

/** One entry of the outline, flattened but still knowing its parent. */
export interface FlatChapter {
  title: string
  /** 0 for a chapter, 1 for a section under one. */
  depth: number
  /** The title of the entry it sits under, or null at the top. */
  parent: string | null
  pageFrom: number
  pageTo: number
}

/**
 * The outline as an ordered list, no deeper than `MAX_DEPTH`.
 *
 * Ordered by page rather than by the order the entries happened to be
 * written in, because the page order is the reading order and the
 * reading order is what the bed is claiming.
 */
export function flattenChapters(
  chapters: OutlineEntry[],
  { maxDepth = MAX_DEPTH, maxTopics = MAX_TOPICS }: { maxDepth?: number; maxTopics?: number } = {}
): FlatChapter[] {
  const out: FlatChapter[] = []

  const walk = (entries: OutlineEntry[], depth: number, parent: string | null) => {
    // `maxDepth` counts levels, not the deepest index: 2 is a chapter
    // and its sections, which are depths 0 and 1.
    if (depth >= maxDepth) return
    for (const entry of [...entries].sort((a, b) => a.pageFrom - b.pageFrom)) {
      const title = entry.title.trim()
      if (!title) continue
      out.push({ title, depth, parent, pageFrom: entry.pageFrom, pageTo: entry.pageTo })
      if (entry.children?.length) walk(entry.children, depth + 1, title)
    }
  }
  walk(chapters, 0, null)

  // Too many. Drop to the chapters alone rather than truncating the
  // list, which would sow the first half of a book and call it the bed.
  if (out.length > maxTopics) {
    const top = out.filter(c => c.depth === 0)
    return top.slice(0, maxTopics)
  }

  return out
}

/** A chapter, once the resolver has decided what concept it is. */
export interface NamedChapter {
  /** The chapter as the document titles it. */
  chapter: string
  /** The topic it was filed as, which is usually not the same words. */
  topicId: string
}

export interface BedEdge {
  from: string
  to: string
  kind: 'specialises' | 'prereq'
  weight: number
}

/**
 * The edges a document's structure asserts.
 *
 * Two claims, and only two. A section sits under its chapter, which is
 * `specialises` -- the narrower case of the broader one. And a chapter
 * comes before the next chapter at its own level, which is `prereq`.
 *
 * The second is the weaker claim of the two and carries a lower weight
 * to say so. An author orders chapters for many reasons and only
 * sometimes because the earlier one is genuinely needed for the later;
 * a reference manual's alphabetical chapters assert nothing at all. It
 * is still worth recording, because a book's order is evidence about a
 * subject even when it is not proof.
 */
export function bedEdgesFromOutline(
  chapters: FlatChapter[],
  named: Map<string, string>
): BedEdge[] {
  const edges: BedEdge[] = []
  const idOf = (title: string) => named.get(title) ?? null

  for (const chapter of chapters) {
    if (!chapter.parent) continue
    const from = idOf(chapter.parent)
    const to = idOf(chapter.title)
    // A section resolved onto the same topic as its own chapter is not
    // a nesting, it is a duplicate, and an edge from a topic to itself
    // is a cycle the outline would draw forever.
    if (from && to && from !== to) {
      edges.push({ from, to, kind: 'specialises', weight: 0.8 })
    }
  }

  // Consecutive siblings: same parent, in page order.
  const byParent = new Map<string | null, FlatChapter[]>()
  for (const chapter of chapters) {
    const held = byParent.get(chapter.parent) ?? []
    held.push(chapter)
    byParent.set(chapter.parent, held)
  }

  for (const siblings of byParent.values()) {
    for (let i = 0; i < siblings.length - 1; i++) {
      const from = idOf(siblings[i].title)
      const to = idOf(siblings[i + 1].title)
      if (from && to && from !== to) {
        edges.push({ from, to, kind: 'prereq', weight: 0.4 })
      }
    }
  }

  return edges
}

/**
 * The outline as the model is shown it.
 *
 * Indented, with page ranges, because the pages say how much weight a
 * chapter carries -- a two-page chapter and a sixty-page chapter are
 * not equally important and the model cannot tell from the titles.
 */
export function printOutline(chapters: FlatChapter[]): string {
  return chapters
    .map(c => {
      const pages = c.pageTo > c.pageFrom ? `pp. ${c.pageFrom}-${c.pageTo}` : `p. ${c.pageFrom}`
      return `${'  '.repeat(c.depth)}- ${c.title} (${pages})`
    })
    .join('\n')
}
