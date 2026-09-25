import type { Api } from './client'
import type { AskContext, Proposal, AgentWrite } from '@didactic/core/ask'

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
}

export const ask = (api: Api) => ({
  /** Say something. Omitting the conversation starts one. */
  say: (body: { conversationId?: string; message: string; context: AskContext }) =>
    api.post<AskAnswer>('/api/ask', body),
  /** Create a topic the agent offered. The only call here that reaches
   *  the map. */
  accept: (id: string, body: { name: string; summary: string }) =>
    api.post<{ topicId: string }>(`/api/ask/${id}/accept`, body),
  /** Take back a mark or a card the agent kept. Safe to call twice. */
  undo: (id: string, body: { kind: 'mark' | 'card'; writeId: string }) =>
    api.post<{ ok: true }>(`/api/ask/${id}/undo`, body),
  /** Write the discussion into the lesson it happened in. */
  fold: (id: string) => api.post<{ ok: true }>(`/api/ask/${id}/fold`, {}),
})
