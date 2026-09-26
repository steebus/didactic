-- Sprouting subjects: subjects nobody sowed, read off what the reader's
-- material keeps putting together. The design is
-- `docs/superpowers/specs/2026-09-26-sprouting-subjects-design.md`.
--
-- Two things, and neither changes a row that already exists.
--
-- 1. A second vector per topic, of its title *and* its summary. The
--    one already there is of the title alone, and the resolver's
--    thresholds are calibrated on exactly that, so it is left alone:
--    this one is for reading which topics are about the same thing,
--    where a title like "Composition" says much less than its summary.
--    Null means not embedded yet -- it is filled lazily, in batches,
--    whenever sprouting subjects are named -- and a trigger forgets it
--    whenever the text it was made from changes, so every write path
--    that edits a topic is covered without any of them knowing.
--
-- 2. Somewhere to keep decisions. The communities themselves are
--    computed on every read and never stored; what is kept is what was
--    decided about one -- its name, whether the reader dismissed it,
--    the subject it became -- with the topics it held at the time, so
--    the next reading can tell it is the same one.
--
-- Safe to run twice: `if not exists` throughout, the trigger function
-- replaced, the trigger and policy dropped before they are created.

alter table topics add column if not exists kin_embedding vector(384);

comment on column topics.kin_embedding is
  'gte-small embedding of "title — summary", for kinship. Null until filled; cleared when the title or summary changes.';

create or replace function forget_kin_embedding()
returns trigger
language plpgsql
as $$
begin
  if new.title is distinct from old.title or new.summary is distinct from old.summary then
    new.kin_embedding := null;
  end if;
  return new;
end;
$$;

drop trigger if exists topics_forget_kin_embedding on topics;
create trigger topics_forget_kin_embedding
before update of title, summary on topics
for each row execute function forget_kin_embedding();

create table if not exists sprouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Its topics as last read. What a later reading matches against, by
  -- overlap, so a decision survives the set gaining or losing a topic.
  topic_ids uuid[] not null,
  -- Its topics when the name was written. A set that has drifted far
  -- enough from these is named again.
  named_topic_ids uuid[],
  title text,
  why text,
  core_topic_ids uuid[] not null default '{}',
  -- open: offered. dismissed: the reader said not this. planted: it
  -- became a subject. passed: the model said it is not a subject.
  status text not null default 'open',
  subject_id uuid references subjects(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table sprouts drop constraint if exists sprouts_status_check;
alter table sprouts add constraint sprouts_status_check
  check (status in ('open', 'dismissed', 'planted', 'passed'));

create index if not exists sprouts_user_idx on sprouts (user_id);
create index if not exists sprouts_subject_idx on sprouts (subject_id);

alter table sprouts enable row level security;

drop policy if exists sprouts_owner on sprouts;
create policy sprouts_owner on sprouts
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
