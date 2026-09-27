-- 063: how each topic is written about.
--
-- A topic's size (`packages/core/src/grain.ts`) leans on signals from
-- the reader's own map. This adds one from outside it: how the subject
-- is written about in the research literature -- how many works carry
-- the phrase in their title or abstract, how they gather under research
-- topics and subfields, and how many are software rather than writing.
-- A tool reads as software; a specialism gathers under one topic; a
-- field spreads across many. The counts come from OpenAlex, searched
-- within the topic's subjects where that leaves enough to go on, and are
-- kept here so the figure is computed on read without asking again.
--
-- Kept for the figure and for checking the rules against the map. Not
-- printed as such: the reader sees only the term it adds to a topic's
-- size, in words.
--
-- Idempotent, like everything since 025: a migration merged to main is
-- applied on the push.

create table if not exists topic_shapes (
  topic_id uuid primary key references topics(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  -- What was searched, so a renamed topic is read again.
  phrase text not null,
  -- The subjects it was searched within; null where it was searched alone.
  context text,
  works int not null,
  topic_share numeric(4,3) not null,
  subfield_share numeric(4,3) not null,
  software_share numeric(4,3) not null,
  top_topic text,
  top_subfield text,
  probed_at timestamptz not null default now()
);

alter table topic_shapes enable row level security;
drop policy if exists topic_shapes_owner on topic_shapes;
create policy topic_shapes_owner on topic_shapes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table topic_shapes is
  'How each topic is written about in the literature: counts behind the shape term of its size (core/grain.readShape).';
