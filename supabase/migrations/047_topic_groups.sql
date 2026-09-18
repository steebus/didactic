-- Topics in a bed, gathered into named groups.
--
-- The bed has been one flat list ordered simplest-first, and for a
-- subject of any size that is a list you read rather than a list you
-- scan: thirty topics running intro to advanced share one ramp, and
-- nothing says which of them are about the same thing. Grouping is the
-- second axis the order could never carry -- subject matter across,
-- complexity down.
--
-- On the membership and not on the topic, for the reason `033` gave
-- about `position`: a topic sits under every subject it genuinely
-- belongs to, and "this belongs with the tooling" is true of it in one
-- bed and not in another. JavaScript groups with the language
-- fundamentals in a front-end bed and with the runtimes in a bed about
-- server-side work, and one column on `topics` could only ever say one
-- of those.
--
-- Not every topic is grouped. Null is the ordinary case, not a
-- deficiency: a topic that belongs with nothing else in the bed sits
-- loose between the boxes, and forcing a "Miscellaneous" group to avoid
-- saying so would be the schema inventing a subject-matter claim the
-- reader never made.
--
-- Safe to run twice: `if not exists` throughout, and the policies are
-- dropped before they are created.

create table if not exists topic_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  title text not null,
  -- Where the group falls among the other groups, simplest first. The
  -- same reading `topic_subjects.position` carries for topics, and it
  -- is kept in the same units so the two can be compared when an
  -- ungrouped topic has to be placed among the boxes.
  position int not null default 0,
  created_by created_by_kind not null default 'ai',
  created_at timestamptz not null default now()
);

create index if not exists topic_groups_subject_idx on topic_groups (subject_id);

-- Which group a topic sits in, in this bed. Null means ungrouped, which
-- is a real answer rather than a missing one.
--
-- `on delete set null` is the whole of what deleting a group means:
-- the box goes and its topics stay in the bed, loose. A group is a way
-- of reading the bed, never a container that owns what is in it, so
-- throwing one away must never be able to take a topic with it.
alter table topic_subjects
  add column if not exists group_id uuid
  references topic_groups(id) on delete set null;

create index if not exists topic_subjects_group_idx on topic_subjects (group_id);

comment on column topic_subjects.group_id is
  'Which group this topic sits in within this subject. Null means ungrouped, which is ordinary.';

-- A group belongs to the reader who owns the subject, read the same way
-- every other table in `025` is read.
alter table topic_groups enable row level security;

drop policy if exists topic_groups_owner on topic_groups;
create policy topic_groups_owner on topic_groups
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
