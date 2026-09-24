/**
 * The thread that ties a course together.
 *
 * A curriculum records what the course is. This records why, and it is
 * the thing every agent contributing to the course is shown before it
 * writes anything: the structural argument the drafting agent made, the
 * qualifying answers the course was planned against, and a running log
 * of what each lesson actually taught.
 *
 * Without it every agent works from the artefact alone. A lesson body
 * is written against a title and its neighbours; a set of cards is cut
 * from a body. None of them can see that the route opens shallow
 * because the reader's own answers showed they hold the fundamentals,
 * or that the middle is thin on purpose because a source they handed
 * over covers it. So each one re-derives an answer to that, and derives
 * a different one, and the course drifts away from itself a lesson at a
 * time.
 *
 * The rendering lives here rather than beside the agents for the
 * ordinary reason: the phone prints this document on the course sheet,
 * and a plan that read one way in a prompt and another on a screen
 * would be two documents. `planPrompt` is the block that goes into a
 * system prompt; `planEntries` is what the sheet lists. Both read the
 * same record.
 */

/** What the reader answered when they sowed the subject, frozen as of
 *  the moment the course was planned. */
export interface PlanQualifier {
  prompt: string
  /** 1-5, the rung the question was pitched at. */
  level: number
  answer: string | null
}

/** One line somebody left in the plan. */
export interface PlanEntry {
  at: string
  by: 'ai' | 'user'
  /** `lesson` is an agent saying what it wrote. `note` is anything
   *  else -- a reader changing direction, an agent recording that it
   *  could not do what was asked. */
  kind: 'lesson' | 'note'
  /** The lesson it is about, where it is about one. */
  ref: string | null
  body: string
}

export interface LearningPlan {
  curriculumId: string
  /** Null where the course predates the plan, which is a different
   *  thing from a plan whose reasoning is empty. */
  reasoning: string | null
  qualifiers: PlanQualifier[]
  entries: PlanEntry[]
  updatedAt: string | null
}

/**
 * How much of the log an agent is shown.
 *
 * The log grows by one line per lesson and a course runs to sixteen, so
 * the whole of it is affordable for a long time yet. The cap is here
 * for the course that has been reworked a dozen times, where the early
 * entries describe lessons that no longer exist -- and for the general
 * rule that a prompt which grows without bound eventually stops being
 * read. Newest kept, because what was taught last is what the next
 * lesson has to follow.
 */
export const ENTRIES_SHOWN = 30

/** An answered qualifier, in one line. Unanswered ones are left out
 *  entirely: "they did not answer this" is not evidence about what they
 *  know, and reads to a model as though it were. */
function qualifierLine(q: PlanQualifier): string | null {
  const answer = q.answer?.trim()
  if (!answer) return null
  return `  - (level ${q.level}) ${q.prompt.trim()}\n    They said: ${answer}`
}

/**
 * The plan as a block for an agent's system prompt.
 *
 * Returns null where there is nothing worth saying -- no reasoning, no
 * answered qualifiers and no entries. A heading with nothing under it
 * teaches a model that this section is noise, and the next course's
 * plan is then read as noise too.
 *
 * Written as instructions rather than as a document, because that is
 * what it is for: an agent shown a page of prose under no heading will
 * summarise it back. The closing line is the load-bearing one. The plan
 * is the course's standing intent, and an agent that quietly departs
 * from it is the drift this whole record exists to stop -- but a plan
 * that cannot be departed from is a cage, and the reader is allowed to
 * change their mind. So: follow it, and say so when you do not.
 */
export function planPrompt(plan: LearningPlan | null): string | null {
  if (!plan) return null

  const parts: string[] = []

  if (plan.reasoning?.trim()) {
    parts.push(`Why this course is shaped the way it is:\n${plan.reasoning.trim()}`)
  }

  const qualifiers = plan.qualifiers.map(qualifierLine).filter((l): l is string => l !== null)
  if (qualifiers.length > 0) {
    parts.push(
      `What the reader said about this subject before the course was planned:\n${qualifiers.join('\n')}`
    )
  }

  const entries = plan.entries.slice(-ENTRIES_SHOWN)
  if (entries.length > 0) {
    parts.push(
      `What has been written into this course so far, oldest first:\n${entries
        .map(e => `  - ${e.by === 'user' ? 'The reader: ' : ''}${e.body.trim()}`)
        .join('\n')}`
    )
  }

  if (parts.length === 0) return null

  return [
    'THE LEARNING PLAN FOR THIS COURSE',
    '',
    'This is the standing record of what the course is for and what it has',
    'covered. It is shared by everyone working on this course, reader and',
    'agent alike, and it is why this course is not the generic one.',
    '',
    parts.join('\n\n'),
    '',
    'Work within it. Do not repeat ground the log says is covered, and do not',
    'contradict the reasoning. Where the material genuinely calls for',
    'departing from it, depart -- and say plainly in your own entry that you',
    'did and why, so the next agent is not left guessing.',
  ].join('\n')
}

/**
 * Whether a plan has enough in it to be worth showing anyone.
 *
 * Used by the sheet to decide between printing the document and
 * printing the line that says the course predates it. Same test the
 * prompt uses, so the two cannot disagree about whether a plan exists.
 */
export function planIsEmpty(plan: LearningPlan | null): boolean {
  return planPrompt(plan) === null
}

/**
 * A lesson agent's line, made fit for the log.
 *
 * One sentence, because the log is read in full by every later agent
 * and sixteen paragraphs is a second curriculum. Trimmed to a hard
 * ceiling rather than asked for politely: the instruction says "very
 * short" and models are not reliable about that, and an agent that
 * writes four hundred words would quietly crowd the reasoning out of
 * everyone else's prompt.
 *
 * Returns null for something with no content, so an agent that answered
 * with whitespace leaves no line rather than an empty bullet.
 */
export const ENTRY_CEILING = 300

export function entryBody(text: string | null | undefined): string | null {
  const trimmed = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!trimmed) return null
  if (trimmed.length <= ENTRY_CEILING) return trimmed

  // Cut at a sentence end where there is one close to the ceiling, so
  // the log reads as sentences rather than as truncations.
  const cut = trimmed.slice(0, ENTRY_CEILING)
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '))
  return stop > ENTRY_CEILING / 2 ? cut.slice(0, stop + 1) : `${cut.trimEnd()}…`
}
