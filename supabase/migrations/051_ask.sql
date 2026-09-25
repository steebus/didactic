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

-- A discussion, found again in the prose it was about.
--
-- The quote and prefix pair is the one `highlights` uses, deliberately:
-- `paintMarks` and `markAnchor` re-find it by machinery that already
-- exists, and a rewritten lesson degrades it the way it degrades a mark
-- rather than in some new way of its own.
create table if not exists ask_anchors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  conversation_id uuid not null references conversations(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,

  quote text not null,
  prefix text,

  created_at timestamptz not null default now()
);

create index if not exists ask_anchors_lesson_idx on ask_anchors (user_id, lesson_id);

alter table ask_anchors enable row level security;

drop policy if exists "own ask anchors" on ask_anchors;
create policy "own ask anchors" on ask_anchors
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on table ask_anchors is
  'A conversation kept against a passage of a lesson, found again by the same quote/prefix pair a highlight uses. Arrived in 051.';
