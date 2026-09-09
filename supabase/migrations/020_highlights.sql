-- Marking a passage and saying why.
--
-- A highlight belongs to the lesson it was taken from and to the topic
-- that lesson teaches. The topic is what makes it worth keeping: a
-- passage marked in one lesson is still the clearest thing anyone wrote
-- about that topic a month later, when which lesson it came from has
-- stopped mattering.
create table highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  lesson_id uuid not null references lessons(id) on delete cascade,
  -- Denormalised from the lesson so a highlight can be found by topic
  -- without a join, and so it survives being re-filed. Null where the
  -- lesson teaches no single topic -- scaffolding lessons have none.
  topic_id uuid references topics(id) on delete cascade,

  -- The passage as it read when it was marked. Kept verbatim rather
  -- than as an offset into the body: a lesson body is regenerable, and
  -- an offset into prose that has been rewritten points at nothing.
  -- This is the record; the anchor below is only how it is found again.
  quote text not null,
  -- Enough of the surrounding text to re-find the quote when it appears
  -- more than once. Null when the quote is unique in the body.
  prefix text,

  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index highlights_topic_idx on highlights (topic_id, created_at desc);
create index highlights_lesson_idx on highlights (lesson_id);

-- Searching the quote and the note together, because the thing being
-- looked for is as often what you wrote as what you marked.
alter table highlights
  add column search tsvector
  generated always as (
    to_tsvector('english', coalesce(quote, '') || ' ' || coalesce(note, ''))
  ) stored;

create index highlights_search_idx on highlights using gin (search);

alter table highlights enable row level security;

create policy highlights_owner on highlights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- A highlight is engagement, lightly.
--
-- It needs a depth of its own rather than borrowing 'skim'. Ability is
-- computed from the depth, not from the ability_delta stored beside
-- it, so filing highlights as skims would score marking one sentence
-- exactly as highly as reading a whole article. 'marked' sits below
-- skim and compounds through the same log curve as everything else,
-- which is what makes ten of them count for well under ten times one.
alter type exposure_source add value if not exists 'highlight';
alter type exposure_depth add value if not exists 'marked';
