-- Tagging what a mark is about.
--
-- A mark already belongs to the lesson it was taken from and the topic
-- that lesson teaches. That is where it came from, and it is not
-- always what it is about: the thought a passage on custody leaves you
-- with is very often about settlement, which is a topic away, and the
-- note saying so was until now a sentence nothing could follow.
--
-- So a note can name topics and lessons, and what it names is kept
-- here as well as in the note. Kept in the note because that is where
-- the reader put it and where it reads; kept here because the graph
-- has to draw it, and parsing every note to lay out the bed is a
-- reading that gets slower with every mark ever taken.
--
-- The two cannot drift: this table is rewritten from the note by the
-- one route that writes notes, so the note is the record and this is
-- its index.
create table highlight_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  highlight_id uuid not null references highlights(id) on delete cascade,

  -- Exactly one end. A tag points at a topic or at a lesson, and the
  -- foreign keys are what make a grubbed-out topic take its tags with
  -- it rather than leaving the graph drawing edges into nothing.
  topic_id uuid references topics(id) on delete cascade,
  lesson_id uuid references lessons(id) on delete cascade,

  created_at timestamptz not null default now(),

  constraint highlight_tags_one_end check (num_nonnulls(topic_id, lesson_id) = 1)
);

-- Naming the same thing twice in one note is one tag, not two. Partial
-- because a null end is not a duplicate of another null end.
create unique index highlight_tags_topic_once
  on highlight_tags (highlight_id, topic_id) where topic_id is not null;
create unique index highlight_tags_lesson_once
  on highlight_tags (highlight_id, lesson_id) where lesson_id is not null;

-- The readings that matter: everything tagged into a topic, and
-- everything one mark names.
create index highlight_tags_topic_idx on highlight_tags (topic_id);
create index highlight_tags_lesson_idx on highlight_tags (lesson_id);
create index highlight_tags_highlight_idx on highlight_tags (highlight_id);

alter table highlight_tags enable row level security;

create policy highlight_tags_owner on highlight_tags
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
