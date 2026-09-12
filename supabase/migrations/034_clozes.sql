-- Tending: the concepts a worked lesson left behind, and the clozes
-- that ask whether they are still there.
--
-- A lesson is read once. PRODUCT.md is careful that exposure is not
-- ability, and this is the only honest way to tell the two apart
-- afterwards: ask, at the moment the reader is about to forget, and let
-- the answer move the schedule. What is asked is a cloze -- one passage
-- the lesson actually wrote, with the load-bearing words taken out --
-- rather than a question invented about it, so the reading and the
-- asking are the same words and a card can be shown back in its place
-- in the lesson.
--
-- Scheduling is FSRS (packages/core/src/fsrs.ts) and the state it needs
-- lives on the cloze row: stability, difficulty, the rung it is on, and
-- when it is next wanted. The arithmetic is deliberately not in here.
-- It is fitted, it will be refitted, and both front ends have to agree
-- about it -- so it lives in the shared package with its tests, and the
-- database holds only what it computed.
--
-- Safe to run twice, like everything since 025: Supabase applies a
-- merged migration on push and this project's remote has been taken by
-- hand before.

-- Where a card is in its life. `learning` and `relearning` are the
-- minutes after a miss -- before and after the card has ever been held
-- -- and `review` is the ordinary state, due in days rather than
-- minutes.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'cloze_state') then
    create type cloze_state as enum ('new', 'learning', 'review', 'relearning');
  end if;
end $$;

-- How a cloze was answered. Four rungs because FSRS is fitted on four;
-- the Tend sheet offers three of them and the fourth stays a rung the
-- arithmetic understands. See `TENDING` in `@didactic/core/clozes`.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'cloze_rating') then
    create type cloze_rating as enum ('again', 'hard', 'good', 'easy');
  end if;
end $$;

-- A concept a lesson taught.
--
-- Two to four per worked lesson, which is the whole point of the unit:
-- a lesson has one thing it is for and two or three things it leans on,
-- and a reader who can still do those has kept the lesson. More than
-- four and tending becomes a chore that gets abandoned; fewer than two
-- and a lesson reduces to a slogan.
create table if not exists cloze_concepts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  lesson_id uuid not null references lessons(id) on delete cascade,
  -- Denormalised off the lesson's curriculum, exactly as a highlight
  -- denormalises it (020): tending is asked for by topic and by subject
  -- far more often than by lesson, and a concept should survive being
  -- re-filed. Null where the lesson teaches no single topic --
  -- scaffolding lessons have none.
  topic_id uuid references topics(id) on delete set null,
  name text not null,
  -- What the lesson said about it, in a sentence. Printed above the
  -- card so an answer is recalled rather than guessed from nothing.
  gist text,
  position int not null default 0,
  created_by created_by_kind not null default 'ai',
  created_at timestamptz not null default now()
);

create index if not exists cloze_concepts_lesson_idx
  on cloze_concepts (lesson_id, position);
create index if not exists cloze_concepts_topic_idx
  on cloze_concepts (topic_id);

-- A cloze, and its place in the schedule.
create table if not exists clozes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  -- Null is allowed: a cloze the reader made by hand over a passage
  -- they chose belongs to no concept the agent named, and inventing one
  -- for it would put a word in their mouth.
  concept_id uuid references cloze_concepts(id) on delete set null,
  lesson_id uuid not null references lessons(id) on delete cascade,
  topic_id uuid references topics(id) on delete set null,

  -- The passage as it read when the cloze was made, whole -- the blank
  -- included, in its own words. Kept verbatim rather than as an offset
  -- into the body for the reason 020 gives: a lesson body is written on
  -- demand and regenerable, and an offset into prose that has been
  -- rewritten points at nothing. It is also what lets the reading show
  -- which of its sentences are being tended.
  text text not null,
  -- Enough of what came before to tell two identical passages apart,
  -- when the cloze is drawn back onto the prose. Null when the passage
  -- is unique in the body.
  prefix text,

  -- The words taken out, and where they sit in `text`. Both, because
  -- the offsets settle a word that appears twice in one sentence and
  -- the words themselves survive an edit that moves the offsets.
  blank text not null,
  blank_start int not null,
  blank_end int not null,
  -- Shown on request, never by default. Usually null.
  hint text,

  created_by created_by_kind not null default 'ai',

  -- What FSRS computed. Null until the card has been answered once:
  -- a new card has no memory to describe, and a zero would be a lie
  -- the scheduler would then reason from.
  stability double precision,
  difficulty double precision,
  state cloze_state not null default 'new',
  reps int not null default 0,
  lapses int not null default 0,
  -- Now, for a card just made: a cloze is due the moment it exists, so
  -- the lesson just worked is tended the same day rather than waiting
  -- for a schedule it has no place in yet.
  due timestamptz not null default now(),
  last_reviewed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The blank has to be inside the passage. A card whose blank runs off
  -- the end of its own text is unanswerable, and the front ends would
  -- have to guard every read; the database can simply refuse it.
  constraint clozes_blank_within_text
    check (blank_start >= 0 and blank_end > blank_start and blank_end <= length(text))
);

-- What is due, for the reader, oldest first. Everything the Tend sheet
-- and the nav tally ask for is this index: the tally is printed on
-- every sheet, so the count has to be an index scan rather than a walk.
create index if not exists clozes_due_idx on clozes (user_id, due);
create index if not exists clozes_lesson_idx on clozes (lesson_id);
create index if not exists clozes_topic_idx on clozes (topic_id, due);
create index if not exists clozes_concept_idx on clozes (concept_id);

-- The log: every answer, and what it did to the numbers.
--
-- Separate from the row for the reason the exposure log is separate
-- from the ability figure. The row says where the card stands now; this
-- says how it got there, which is the only thing that can be refitted
-- against. FSRS weights are fitted on review histories, so a history
-- thrown away is a scheduler that can never be tuned to this reader.
create table if not exists cloze_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  cloze_id uuid not null references clozes(id) on delete cascade,
  rating cloze_rating not null,
  -- Days since the previous answer, as the scheduler computed it.
  elapsed_days double precision not null default 0,
  -- How likely the reader was to hold it, just before they answered.
  -- The one number that says whether the schedule is any good.
  retrievability double precision,
  stability_before double precision,
  difficulty_before double precision,
  stability_after double precision not null,
  difficulty_after double precision not null,
  state_after cloze_state not null,
  due_after timestamptz not null,
  reviewed_at timestamptz not null default now()
);

create index if not exists cloze_reviews_cloze_idx
  on cloze_reviews (cloze_id, reviewed_at desc);
create index if not exists cloze_reviews_user_idx
  on cloze_reviews (user_id, reviewed_at desc);

-- Ownership in the database, not only in the app (025). The API's
-- service role bypasses all of it; what this buys is that the phone's
-- own token reads exactly the rows it owns.
alter table cloze_concepts enable row level security;
alter table clozes enable row level security;
alter table cloze_reviews enable row level security;

drop policy if exists cloze_concepts_owner on cloze_concepts;
create policy cloze_concepts_owner on cloze_concepts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists clozes_owner on clozes;
create policy clozes_owner on clozes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists cloze_reviews_owner on cloze_reviews;
create policy cloze_reviews_owner on cloze_reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on table clozes is
  'One passage from a lesson with its load-bearing words removed, and where FSRS says it stands. The arithmetic is packages/core/src/fsrs.ts; this table holds only what it computed.';

comment on table cloze_reviews is
  'Every answer ever given. Kept so the weights can one day be fitted to this reader rather than to the published average.';
