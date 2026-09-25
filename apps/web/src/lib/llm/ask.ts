import Anthropic from '@anthropic-ai/sdk'
import { NO_THINKING } from './thinking'
import { toolText } from './toolInput'
import { blockPromptSection } from '@didactic/core/blocks'
import { contextPreamble, type AskContext, type Proposal, type AgentWrite } from '@didactic/core/ask'

/**
 * The agent a reader talks to from the corner of the page.
 *
 * What it can do is split by blast radius rather than by convenience. A
 * mark and a card are the reader's own material against one lesson, and
 * both are deleted in one press by machinery that already exists, so the
 * agent keeps them and says that it did. A topic is a row in the map
 * that the resolver, the filing rules and the graph all read, so it is
 * offered and waits for a tap.
 *
 * What that buys is bounded rather than absolute: something written into
 * a lesson body can cause a spurious mark, which is visible and
 * removable, and cannot reach the map.
 *
 * It draws with the lesson blocks, from the same registry and the same
 * generated prompt, so a tenth block is offered here without an edit.
 */

let client: Anthropic | null = null

/** Constructed on first use: building the SDK at module load fails the
 *  production build on any machine without a key. */
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set')
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return client
}

/** Enough for an explanation with a diagram in it, and not so much that
 *  a wandering answer is billed for. */
const MAX_TOKENS = 2000

/** How many times round the tool loop before the answer stands as it is.
 *  Four covers read, then search, then answer, with room to spare. */
const ROUNDS = 4

/** How much of a lesson a `read_lesson` hands back. Enough for a long
 *  section, short of handing the whole prompt budget to one tool result. */
const READ_CEILING = 4000

export interface AskTurn {
  text: string
  proposals: Proposal[]
  writes: AgentWrite[]
}

/**
 * What the turn is allowed to do to the world.
 *
 * The effects are passed in rather than reached for, so this module has
 * no database client of its own and the loop can be exercised with
 * fakes -- which is the same arrangement every other reader in here uses
 * for the same reason.
 */
export interface AskDeps {
  addMark(quote: string, note: string): Promise<{ id: string }>
  addCard(question: string, answer: string): Promise<{ id: string }>
  readLesson(section?: string): Promise<string>
  searchMap(query: string): Promise<Array<{ id: string; name: string }>>
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'add_mark',
    description:
      'Keep a passage of the lesson as a mark, with a note. Use when the reader has understood something worth having again later. The quote must be text that appears in the lesson verbatim.',
    input_schema: {
      type: 'object',
      properties: {
        quote: { type: 'string', description: 'The passage, exactly as it appears.' },
        note: { type: 'string', description: 'Why it is worth keeping, in a sentence.' },
      },
      required: ['quote', 'note'],
    },
  },
  {
    name: 'add_card',
    description:
      'Keep a question and its answer as a card for review. Use when something in the conversation is worth being asked again in a week.',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        answer: { type: 'string' },
      },
      required: ['question', 'answer'],
    },
  },
  {
    name: 'propose_topic',
    description:
      'Offer a new topic for the map. Search first with search_map: if the idea is already there under another name, say so instead of proposing a near-duplicate. Nothing is created until the reader accepts.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        summary: { type: 'string', description: 'One or two sentences on what it covers.' },
      },
      required: ['name', 'summary'],
    },
  },
  {
    name: 'read_lesson',
    description:
      'Read the lesson. Omit section to get the whole body. You are already given the section the reader is at, so use this only when the conversation has moved somewhere else.',
    input_schema: {
      type: 'object',
      properties: { section: { type: 'string' } },
    },
  },
  {
    name: 'search_map',
    description:
      'Find existing topics by name, to avoid proposing something the map already holds.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
]

function systemPrompt(context: AskContext): string {
  return `You are a tutor inside a learning app, answering a reader who is in the middle of their own material.

${contextPreamble(context)}

Answer the question they actually asked, at the length it deserves -- a sentence where a sentence does, and no throat-clearing. You are talking to one person about something in front of both of you, so do not restate what they can see.

Keep what is worth keeping: a mark when a passage should be findable again, a card when something should be asked again in a week. Do it rather than offering to. Propose a topic only when the conversation has genuinely opened one the map does not hold, and search first.

${blockPromptSection()}`
}

/**
 * One turn of the conversation, tools and all.
 *
 * Returns what to show and what happened. A tool that throws is reported
 * back to the model as a failed result rather than ending the turn: a
 * card that could not be written should not cost the reader the
 * explanation that came with it.
 */
export async function askTurn(input: {
  context: AskContext
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  message: string
  deps: AskDeps
}): Promise<AskTurn> {
  const { context, history, message, deps } = input

  const messages: Anthropic.MessageParam[] = []

  // The section the reader is looking at, handed over before the talk
  // starts. This is what makes "I don't follow this bit" answerable
  // without a tool call, which is the common case.
  if (context.sectionText) {
    messages.push({
      role: 'user',
      content: `For reference, the section they are reading says:\n\n${context.sectionText}`,
    })
    messages.push({ role: 'assistant', content: 'Understood.' })
  }

  for (const m of history) messages.push({ role: m.role, content: m.content })
  messages.push({ role: 'user', content: message })

  const proposals: Proposal[] = []
  const writes: AgentWrite[] = []
  let text = ''

  for (let round = 0; round < ROUNDS; round++) {
    const reply = await getClient().messages.create({
      model: 'claude-sonnet-5',
      max_tokens: MAX_TOKENS,
      thinking: NO_THINKING,
      system: systemPrompt(context),
      tools: TOOLS,
      messages,
    })

    const said = reply.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim()

    // Keep the last round that said anything: a round that only calls a
    // tool must not blank what the round before it wrote.
    if (said) text = said

    const calls = reply.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    if (!calls.length) break

    messages.push({ role: 'assistant', content: reply.content })

    const results: Anthropic.ToolResultBlockParam[] = []
    for (const call of calls) {
      const given: unknown = call.input ?? {}
      const say = (content: string) =>
        results.push({ type: 'tool_result', tool_use_id: call.id, content })

      try {
        if (call.name === 'add_mark') {
          const quote = toolText(given, 'quote')
          const note = toolText(given, 'note')
          if (!quote) {
            say('No quote given; nothing was kept.')
          } else {
            const { id } = await deps.addMark(quote, note)
            writes.push({ kind: 'mark', id, label: quote })
            say('Kept.')
          }
        } else if (call.name === 'add_card') {
          const question = toolText(given, 'question')
          const answer = toolText(given, 'answer')
          if (!question || !answer) {
            // `toolText` has already refused a blank or a non-string, so
            // this is the model genuinely not having said one of them.
            say('A card needs both a question and an answer; nothing was kept.')
          } else {
            const { id } = await deps.addCard(question, answer)
            writes.push({ kind: 'card', id, label: question })
            say('Kept.')
          }
        } else if (call.name === 'propose_topic') {
          const name = toolText(given, 'name')
          if (!name) {
            say('A topic needs a name; nothing was offered.')
          } else {
            proposals.push({ kind: 'topic', name, summary: toolText(given, 'summary') })
            say('Offered to the reader, who decides whether it is created.')
          }
        } else if (call.name === 'read_lesson') {
          const section = toolText(given, 'section') || undefined
          say((await deps.readLesson(section)) || 'The lesson has no body yet.')
        } else if (call.name === 'search_map') {
          const found = await deps.searchMap(toolText(given, 'query'))
          say(
            found.length
              ? found.map(t => `${t.name} (${t.id})`).join('\n')
              : 'Nothing in the map matches.'
          )
        } else {
          say('Unknown tool.')
        }
      } catch (e) {
        // Reported to the model rather than thrown: a failed write must
        // not cost the reader the explanation that came with it.
        say(`That failed: ${e instanceof Error ? e.message : 'unknown error'}`)
      }
    }

    messages.push({ role: 'user', content: results })
  }

  // Four rounds of tool calls and never a word. The model was still
  // working when the loop ran out, and what it did is real -- marks may
  // have been kept -- so the turn says what happened rather than coming
  // back empty. An empty assistant message is not a cosmetic problem:
  // it is stored, read back as history, and the API refuses a message
  // with no content, which would fail every later turn of this
  // conversation rather than just this one.
  if (!text) {
    text = writes.length
      ? `Kept ${writes.map(w => `a ${w.kind}`).join(' and ')}, but ran out of room before writing an answer. Ask again and I will.`
      : 'I ran out of room before writing an answer. Ask again.'
  }

  return { text, proposals, writes }
}

export { READ_CEILING }
