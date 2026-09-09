/**
 * The lesson block registry.
 *
 * A lesson is markdown, and markdown is a wall of prose for anything
 * that is really a shape or a question. A block is a fenced code
 * region the renderer understands:
 *
 *     ```chart
 *     { "kind": "line", ... }
 *     ```
 *
 * The payload is data, never markup. That is the whole safety
 * argument: the writing agent cannot emit HTML, only values that a
 * component we wrote decides how to draw. Nothing here is
 * dangerouslySetInnerHTML.
 *
 * The registry lives in code rather than in the database on purpose.
 * A block is a schema and a React component that have to agree, and
 * they can only be kept in step by shipping together -- a row in a
 * table describing a component that no longer matches is a lesson that
 * renders as an error. What the database holds is the lesson body; what
 * this holds is what a body is allowed to say.
 *
 * The prompt the writing agent gets is generated from this file (see
 * blockPromptSection), so adding a block teaches the agent about it in
 * the same commit that makes it renderable.
 */

export interface BlockSpec {
  /** The fence language: ```chart, ```check, and so on. */
  name: string
  /** One line for the writing agent: when this block earns its place. */
  when: string
  /** A real, valid payload. Doubles as the prompt's example and as the
   *  fixture the parser is tested against. */
  example: string
}

export const BLOCKS: BlockSpec[] = [
  {
    name: 'chart',
    when:
      'a relationship is easier to see than to read -- growth over time, a comparison across categories, how one quantity responds to another',
    example: `{
  "kind": "line",
  "title": "A pound a month, compounded",
  "x": { "label": "Years", "values": [0, 5, 10, 15, 20, 25, 30] },
  "y": { "label": "Value (£)" },
  "series": [
    { "name": "At 5%", "values": [0, 6800, 15500, 26700, 41100, 59500, 83200] },
    { "name": "At 8%", "values": [0, 7300, 18300, 34600, 58900, 95100, 149000] }
  ],
  "caption": "The gap is the compounding, not the contributions -- both lines paid in the same £360 a year."
}`,
  },
  {
    name: 'check',
    when:
      'a point has just been made that is easy to nod along to and easy to get wrong; put the misconception in as a wrong answer',
    example: `{
  "question": "A company's share price is £200 and another's is £8. Which is the larger company?",
  "options": [
    { "text": "The £200 one", "correct": false, "why": "Share price on its own says nothing about size -- it depends entirely on how many shares exist." },
    { "text": "The £8 one", "correct": false, "why": "Not from the price alone. A low price can mean many shares outstanding, or a small company." },
    { "text": "Cannot tell without the share count", "correct": true, "why": "Right. Price times shares outstanding is market capitalisation, and that is the measure of size." },
    { "text": "They are the same size", "correct": false, "why": "Nothing in the prices suggests that." }
  ]
}`,
  },
  {
    name: 'compare',
    when:
      'two or three things are routinely confused with each other and the difference is the lesson -- shows them side by side on the same rows',
    example: `{
  "title": "Common against preferred",
  "columns": ["Common stock", "Preferred stock"],
  "rows": [
    { "label": "Voting", "values": ["Usually one vote a share", "Usually none"] },
    { "label": "Dividends", "values": ["Variable, can be cut", "Fixed, paid first"] },
    { "label": "If the company fails", "values": ["Paid last", "Paid before common"] }
  ]
}`,
  },
  {
    name: 'steps',
    when:
      'something happens in a fixed order and the order is the point -- a settlement, a process, a sequence of events',
    example: `{
  "title": "What happens when you buy a share",
  "steps": [
    { "label": "Order placed", "detail": "You tell the broker what and how much." },
    { "label": "Routed", "detail": "The broker sends it to an exchange or market maker." },
    { "label": "Matched", "detail": "A seller is found at a price and the trade executes." },
    { "label": "Settled", "detail": "Cash and ownership actually change hands, a day or two later." }
  ]
}`,
  },
]

/** Fence for a block of this name, at the start of a line. */
const FENCE = /^```(\w+)\n([\s\S]*?)\n```$/

export type ParsedBlock =
  | { kind: 'markdown'; text: string }
  | { kind: 'block'; name: string; data: unknown }

/**
 * Split a lesson body into prose and blocks.
 *
 * Anything that is not a known block, or whose payload is not valid
 * JSON, is left exactly as it was: an unparseable chart should print
 * as the code block it already looks like rather than swallowing a
 * section of the lesson or throwing the page away.
 */
export function parseBlocks(markdown: string): ParsedBlock[] {
  const names = new Set(BLOCKS.map(b => b.name))
  const out: ParsedBlock[] = []
  // Split on fenced regions, keeping them. Non-greedy so two blocks in
  // one lesson do not merge into one.
  const parts = markdown.split(/(^```\w+\n[\s\S]*?\n```$)/m)

  for (const part of parts) {
    if (!part) continue
    const match = part.match(FENCE)
    if (!match || !names.has(match[1])) {
      if (part.trim()) out.push({ kind: 'markdown', text: part })
      continue
    }
    try {
      out.push({ kind: 'block', name: match[1], data: JSON.parse(match[2]) })
    } catch {
      // Malformed payload: leave it as prose rather than losing it.
      out.push({ kind: 'markdown', text: part })
    }
  }
  return out
}

/**
 * The part of the lesson prompt that describes the blocks.
 *
 * Generated rather than written out, so a block added to BLOCKS is
 * offered to the writing agent without a second edit somewhere else.
 */
export function blockPromptSection(): string {
  return `You may use these blocks where one genuinely helps. Each is a fenced code block whose body is JSON, exactly in the shape shown. Use them sparingly -- a lesson is still prose, and a block that restates the paragraph above it is worse than no block. Never put markup or HTML in a payload.

${BLOCKS.map(b => `### \`\`\`${b.name}\nUse when ${b.when}.\n\n\`\`\`${b.name}\n${b.example}\n\`\`\``).join('\n\n')}`
}
