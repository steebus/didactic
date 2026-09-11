/**
 * A document handed over: what it may be, where it lands, and how
 * closely the bed that grows from it is meant to follow it.
 *
 * Both front ends need the same three answers before a byte moves. The
 * phone picks a file through a document picker and the web through an
 * input, but the size ceiling, the "PDFs only" rule and the shape of
 * the path in the bucket have to be one set of facts or the two clients
 * disagree about what a valid upload is -- and the one that disagrees
 * quietly is the phone, which finds out at the far end of an upload.
 *
 * Nothing here touches storage, the database or a DOM. It decides and
 * it names; the routes do the moving.
 */

/**
 * The ceiling on a document.
 *
 * Fifty megabytes because a textbook is one: the old fifteen was set
 * for a certificate and a course handbook, and a book blows through it
 * without being unreasonable. It is also the point past which the
 * rounds below start to be a great many of them.
 *
 * This is only reachable because the bytes no longer pass through a
 * function. A serverless request body is capped at four and a half
 * megabytes by the platform, well under a book, so the browser is given
 * a signed URL and PUTs to storage itself. Raising this number without
 * that change would only move where the failure happens.
 */
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024

/** What the old multipart route still stands, for a client that has
 *  not been rebuilt. Anything above it never reaches the handler. */
export const MAX_PROXIED_BYTES = 4 * 1024 * 1024

/** Said to someone whose file is too big, in their terms not ours. */
export function tooLarge(bytes: number): string {
  const mb = (bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')
  const cap = MAX_DOCUMENT_BYTES / (1024 * 1024)
  return `That file is ${mb} MB, and the ceiling is ${cap} MB.`
}

/** Only PDFs are taken, because a PDF is the only thing the reader can
 *  actually open. An image would be filed as proof nobody can read. */
export function isPdf(name: string, contentType?: string | null): boolean {
  return contentType === 'application/pdf' || /\.pdf$/i.test(name.trim())
}

export const NOT_A_PDF =
  'PDFs only — anything else cannot be read. Name it as a qualification instead.'

/**
 * Where a document lives in the bucket.
 *
 * The owner's id is a segment of the path. The bucket policy written in
 * 025 establishes ownership through the `resources` row that points at
 * the object, and still does -- this does not replace it. What it adds
 * is that the path a client asks to be let into can be checked against
 * the caller before anything is signed, which matters now that the
 * client does the uploading rather than the server.
 */
export function documentPath(userId: string, id: string): string {
  return `documents/${userId}/${id}.pdf`
}

/** Whether a path is one of ours, and the caller's own. Used before a
 *  claimed upload is believed. */
export function ownsPath(path: string, userId: string): boolean {
  return new RegExp(
    `^documents/${userId.replace(/[^a-zA-Z0-9-]/g, '')}/[0-9a-f-]{36}\\.pdf$`
  ).test(path)
}

/** A title from a filename, where the document does not name itself. */
export function titleFromFilename(name: string): string {
  return name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() || 'Uploaded document'
}

/* -------------------------------------------------------------------- */

/**
 * How closely a bed follows the document it was sown from.
 *
 * Three rungs and not a slider, which is a deliberate departure from
 * the roots gauge beside it. The gauge is continuous because 0-5 is one
 * claim about one person, and a half step between two rungs still means
 * something. This does not interpolate: each rung is a different path
 * through the code, and a dial promising a smooth blend between "the
 * chapters are the topics" and "read it for what it covers" would be
 * promising something that does not exist.
 *
 * Not handing a document over at all is the fourth case, and it is the
 * one that needs no name: it is what sowing has always done.
 */
export const FIDELITIES = ['verbatim', 'follow', 'source'] as const

export type Fidelity = (typeof FIDELITIES)[number]

export interface FidelityRung {
  value: Fidelity
  /** What the rung is called on the sheet. */
  label: string
  /** What it does, in one line under the label. */
  hint: string
}

/**
 * The rungs in order, closest-following first.
 *
 * `verbatim` carries a caveat the other two do not need, and it is
 * printed rather than left to be discovered. A reader who asks for the
 * document's own chapters and then watches a topic come back under
 * another name will think the setting is broken. It is not: the
 * document fixes which topics there are and what order they sit in,
 * and the resolver still decides what each one *is*, because a topic
 * is shared across every subject it sits under and "Getting started"
 * is not a thing anyone can be said to know.
 */
export const FIDELITY_RUNGS: FidelityRung[] = [
  {
    value: 'verbatim',
    label: 'To the letter',
    hint: 'Its chapters become the topics, in its order. Names are still matched to the map, so a chapter called "Getting started" is filed under what it actually teaches.',
  },
  {
    value: 'follow',
    label: 'Follow its order',
    hint: 'Its chapters seed the bed, and what it skips or doubles up on is put right.',
  },
  {
    value: 'source',
    label: 'For the ground it covers',
    hint: 'The bed is laid out as usual. What the document covers is read; how it is arranged is only a suggestion.',
  },
]

/** The rung a document arrives at when nobody says otherwise.
 *
 *  `follow` rather than `verbatim`, because a reference manual with
 *  forty chapters of wildly unequal weight is a common thing to hand
 *  over and a terrible bed. Following the order is right far more
 *  often than reproducing it. */
export const DEFAULT_FIDELITY: Fidelity = 'follow'

export function rungFor(value: Fidelity): FidelityRung {
  return FIDELITY_RUNGS.find(r => r.value === value) ?? FIDELITY_RUNGS[1]
}

/** Whether an arbitrary string off the wire is a rung. */
export function isFidelity(value: unknown): value is Fidelity {
  return typeof value === 'string' && (FIDELITIES as readonly string[]).includes(value)
}
