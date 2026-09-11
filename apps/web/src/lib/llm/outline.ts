import Anthropic from '@anthropic-ai/sdk'
import type { PageText } from '@didactic/core/passages'

/**
 * Reading a contents page.
 *
 * The fallback for a document with no bookmarks in it. Most such
 * documents still print their own contents in the first few pages, and
 * a contents page is a thing a model reads well: it is a list of names
 * against numbers, and the job is transcription rather than judgement.
 *
 * It is a guess all the same, and is recorded as one -- `resource_outline`
 * keeps whether the shape came from the document's own bookmarks or
 * from here, because a bed laid out to the letter from a misread
 * contents page is wrong in a way nobody would think to check.
 *
 * The numbers printed on a contents page are not always the numbers
 * pdfjs counts: front matter is often numbered in roman, or not at all,
 * so "Chapter 1 . . . 1" can be the seventeenth page of the file. The
 * model is given the physical page each piece of text came off and
 * asked for physical pages back, which is the only kind a citation can
 * use.
 */

export interface ProposedChapter {
  title: string
  pageFrom: number
}

const TOOL = {
  name: 'record_contents',
  description:
    "Record a document's chapters and the physical page each one starts on.",
  input_schema: {
    type: 'object' as const,
    properties: {
      chapters: {
        type: 'array',
        description:
          'The chapters in the order they appear. Empty if the pages shown carry no contents listing at all.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'The chapter title as printed.' },
            page_from: {
              type: 'number',
              description:
                'The PHYSICAL page of the file the chapter starts on, counting the very first page of the file as 1. Not the number printed on the page, where they differ.',
            },
          },
          required: ['title', 'page_from'],
        },
      },
    },
    required: ['chapters'],
  },
}

/**
 * Ask what the front of a document says is in it.
 *
 * Returns an empty list rather than throwing where there is no contents
 * page to read: plenty of documents have neither bookmarks nor
 * contents, and that is a fact about the document, not a failure. The
 * caller records `none` and the bed is laid out without it.
 */
export async function readContentsPages({
  title,
  pageCount,
  front,
}: {
  title: string
  pageCount: number
  front: PageText[]
}): Promise<ProposedChapter[]> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set')

  const shown = front
    .map(p => `--- physical page ${p.page} ---\n${p.text.slice(0, 4000)}`)
    .join('\n\n')

  if (!shown.trim()) return []

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const res = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 2000,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL.name },
    messages: [
      {
        role: 'user',
        content: `Here are the first pages of "${title}", a document of ${pageCount} pages. Each is labelled with its physical page in the file.

${shown}

If these pages carry a table of contents, record the chapters it lists and the physical page each starts on.

Two things to be careful about.

The page numbers printed in a contents listing are the publisher's, and often do not match the physical page of the file — front matter is frequently numbered separately or not at all. Work out the offset from what you can see: if the listing says a chapter is on page 1 and you can see that the file's physical page 17 is where the body begins, then the listing's page 1 is physical page 17, and every later entry shifts by the same amount. Record physical pages.

If these pages carry no contents listing, record no chapters. Do not reconstruct a plausible one from the title — a made-up outline is worse than none, because the bed will be laid out from it as though it were real.`,
      },
    ],
  })

  const tool = res.content.find(c => c.type === 'tool_use')
  if (!tool || tool.type !== 'tool_use') return []

  const raw = (tool.input as { chapters?: unknown }).chapters
  if (!Array.isArray(raw)) return []

  return raw
    .flatMap((c: unknown) => {
      const entry = c as { title?: unknown; page_from?: unknown }
      const name = typeof entry.title === 'string' ? entry.title.trim() : ''
      const page = Number(entry.page_from)
      // A page outside the document is a misread, not a chapter.
      if (!name || !Number.isFinite(page) || page < 1 || page > pageCount) return []
      return [{ title: name, pageFrom: Math.round(page) }]
    })
    .sort((a, b) => a.pageFrom - b.pageFrom)
}
