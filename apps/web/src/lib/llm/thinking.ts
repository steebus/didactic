import type Anthropic from '@anthropic-ai/sdk'

/**
 * Every call in this directory budgets `max_tokens` for the answer
 * alone. This says so.
 *
 * `claude-sonnet-5` thinks unless told not to: omit the parameter and
 * the model runs adaptive thinking, and thinking is spent from the same
 * `max_tokens` the answer comes out of. So a ceiling set by measuring
 * the answer is really a ceiling on thinking plus answer, and the
 * thinking goes first.
 *
 * A round of a lesson is 2500 tokens and a refresher 1500 -- small
 * enough that a long think spends the lot and the reply arrives with a
 * thinking block and no text block at all. That is what "no text
 * returned" was, and why it read as a 502 on a request that the API had
 * answered perfectly happily. Nothing was wrong with the prompt; there
 * was simply nothing left to write the lesson with.
 *
 * It is also where the ceilings already raised in here went. `edges`
 * records measuring a bed that "truncated mid-list" at 2000 and then
 * "produced thirty-three edges in 2720 tokens" at 8000 -- the five
 * thousand tokens in between were never on the wire, and every call in
 * this directory has been paying for them.
 *
 * This is not a judgement that thinking is worthless here. It is that
 * the function these run in is capped at sixty seconds on this plan:
 * a round already takes most of thirty, and one that thinks first does
 * not finish inside the minute. Rounds are how this app buys length,
 * and they only work if the budget buys prose. If the cap ever lifts,
 * the thing to try is `{ type: 'adaptive' }` with a ceiling raised to
 * cover both, not this constant removed and the ceilings left alone.
 */
export const NO_THINKING: Anthropic.ThinkingConfigParam = { type: 'disabled' }
