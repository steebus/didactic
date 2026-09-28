import type { Api } from './client'
import type { AskContext, Proposal, AgentWrite, Accepted } from '@didactic/core/ask'

/** What a turn answers with: what to print, what is offered, and what
 *  was kept without being asked. */
export interface AskAnswer {
  conversationId: string
  text: string
  proposals: Proposal[]
  writes: AgentWrite[]
  /** Set when the model could not be reached. The conversation is still
   *  kept, and the text says so. */
  warning?: string
  /** How many pictures the answer asked to have drawn. They print
   *  nothing until `draw` has been called; absent when there are none. */
  drawing?: number
}

/** What drawing an answer's picture comes back with: the answer as it is
 *  now stored, and why, if the drawing could not be made. */
export interface AskDrawn {
  text: string
  warning?: string
}

export const ask = (api: Api) => ({
  /** Say something. Omitting the conversation starts one. */
  say: (body: { conversationId?: string; message: string; context: AskContext }) =>
    api.post<AskAnswer>('/api/ask', body),
  /** Create a topic the agent offered. The only call here that reaches
   *  the map. */
  /** Accept a proposed topic. It is read against the map first:
   *  `outcome` says whether it was already there, queued for the
   *  reader's call, or added. `topicId` is kept for older callers. */
  accept: (id: string, body: { name: string; summary: string }) =>
    api.post<Accepted>(`/api/ask/${id}/accept`, body),
  /** Take back a mark or a card the agent kept. Safe to call twice. */
  undo: (id: string, body: { kind: 'mark' | 'card'; writeId: string }) =>
    api.post<{ ok: true }>(`/api/ask/${id}/undo`, body),
  /** Write the discussion into the lesson it happened in. */
  fold: (id: string) => api.post<{ ok: true; section?: string }>(`/api/ask/${id}/fold`, {}),
  /** Draw the picture the last answer asked for, and hand back that
   *  answer with it in. Called when `say` answers with `drawing`. */
  draw: (id: string) => api.post<AskDrawn>(`/api/ask/${id}/draw`, {}),
})
