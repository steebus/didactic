-- Conversational mode: a conversation anchored on what was on screen.
--
-- Everything here is additive and safe to run twice. Two columns appear
-- on tables that already exist, and one table is created. The enum value
-- these rows use is added in 050, which is a separate file because a
-- value cannot be used in the transaction that adds it.

-- Where the conversation was had.
--
-- `node_id` is already the topic: 012 renamed `nodes` to `topics` and
-- left the column's name behind it, so a conversation about a topic uses
-- the column that is there rather than a second one beside it. A lesson
-- is what it could not say, so that is what is added.
--
-- `context` is the AskContext as it stood when the question was asked --
-- route, entity, section, and the selected passage where there was one.
-- Frozen rather than live, for the reason 020 gives about a quote: it is
-- the record of where the question was asked, and a section rewritten
-- afterwards does not make the record wrong.
alter table conversations
  add column if not exists lesson_id uuid references lessons(id) on delete cascade,
  add column if not exists context   jsonb;

-- What a message offered and has not had accepted, and what the agent
-- kept by itself -- so the panel can still offer the undo after a reload.
-- Both shapes share the column because both are answers to "what did this
-- message do", and neither is queried across conversations.
alter table messages
  add column if not exists proposals jsonb;

-- When a conversation was written into its lesson.
--
-- Folding twice appends twice: the route re-reads a body that already
-- holds the first fold. The panel disabling its button is not a guard --
-- a retried request or a direct call reaches the route regardless -- so
-- the fact lives on the row and the second attempt is refused.
alter table conversations
  add column if not exists folded_at timestamptz;
