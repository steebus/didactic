/**
 * What has happened to a resource since it was sent in, in a word.
 *
 * A thing added to the inbox goes through a pipeline nobody can see:
 * it is queued, a worker picks it up a minute later, the page is
 * fetched, a model reads it for concepts, each concept is resolved
 * against the graph, and only then is it filed against anything. All of
 * that was invisible. A row sat there saying "added 14 Sept" whether it
 * had been read and filed against six topics, was still waiting its
 * turn, or had failed three times and given up -- and the three look
 * identical if the only thing printed is the date.
 *
 * So the job row is read with the shelf, and this turns the pair into
 * the one sentence the reader actually wants: has this been filed, is
 * it being filed, or did it not work.
 *
 * Pure, and here rather than in the sheet, because the phone prints the
 * same line.
 */

/** The state of the ingestion job behind a resource, as the row holds it. */
export type JobState = 'pending' | 'running' | 'done' | 'failed'

export type Filing =
  /** Waiting for the worker. Nothing has gone wrong; nothing has
   *  happened yet either. */
  | 'waiting'
  /** The worker has it now. */
  | 'reading'
  /** Read, and filed against at least one topic. */
  | 'filed'
  /** Read, and it matched nothing in the graph. Not a failure: an
   *  article about something genuinely new is filed against nothing
   *  until a subject is sown that covers it. */
  | 'nothing'
  /** It could not be read, and has stopped trying. */
  | 'failed'
  /** No job at all. Material offered as proof of what you already know
   *  arrives read and was never queued. */
  | 'none'

export interface FilingInput {
  /** The ingestion job's state, or null when there is no job. */
  job: JobState | null
  /** How many topics it ended up filed against. */
  topics: number
  /** How many times the worker has tried. */
  attempts?: number
}

export function filingOf({ job, topics }: FilingInput): Filing {
  if (topics > 0) return 'filed'
  if (job === null) return 'none'
  if (job === 'failed') return 'failed'
  if (job === 'running') return 'reading'
  // Done, and filed against nothing. The work finished; the graph had
  // nowhere to put it.
  if (job === 'done') return 'nothing'
  return 'waiting'
}

/**
 * What the row says, and what it means.
 *
 * Two lines rather than one word: the word is what is scanned, and the
 * note is what answers "so is something wrong?" -- which is the
 * question every one of these states raises and only one of them
 * answers badly.
 */
export function filingPhrase(filing: Filing, topics: number): { word: string; note: string | null } {
  switch (filing) {
    case 'filed':
      return {
        word: topics === 1 ? 'Filed' : `Filed · ${topics}`,
        note: null,
      }
    case 'reading':
      return { word: 'Reading it', note: 'Finding what it is about.' }
    case 'waiting':
      return { word: 'Waiting', note: 'In the queue. It is read a minute or so after it arrives.' }
    case 'nothing':
      return {
        word: 'Filed under nothing',
        note: 'It was read, and matched no topic you are growing. Sow a subject that covers it and it will find a home.',
      }
    case 'failed':
      return { word: 'Could not read it', note: null }
    case 'none':
      return { word: '', note: null }
  }
}
