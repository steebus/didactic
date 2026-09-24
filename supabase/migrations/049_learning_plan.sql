-- The reasoning behind a course, kept where every agent working on it
-- can read it.
--
-- `curricula` records what a course *is* -- its title, its shape, its
-- lessons and their order -- and nothing about why it is that. The
-- reasoning existed once, inside the call that drafted it, and was
-- thrown away the moment the tool result was parsed. So every agent
-- that touches the course afterwards starts from the artefact alone: a
-- lesson body is written against a title and its neighbours, a cloze is
-- cut from a body, and none of them can see that the route opens with
-- three shallow lessons *because* the qualifying answers showed the
-- reader already holds the fundamentals and would be bored, or that the
-- middle is deliberately thin because a handed-over source covers it.
--
-- Each agent then re-derives an answer to that, badly and differently,
-- and the course drifts away from itself one lesson at a time.
--
-- This is the thread that ties it together. It holds three things.
--
-- `reasoning` is the structural argument, written by the agent that
-- drafted the course and editable afterwards by anyone. It is what goes
-- into the system prompt of every agent that contributes.
--
-- `qualifiers` is a snapshot of what the reader answered when they
-- sowed the subject. `subject_sowings.qualifiers` already holds that,
-- but at the subject level and as of now -- a snapshot taken here is
-- what the course was actually planned against, and it has to stay
-- still even when the reader sows the subject again. A course planned
-- for someone who could not answer the level-4 questions should not
-- silently re-read itself a year later as though they always could.
--
-- `entries` is the living part: an append log where each agent leaves
-- one short line about what it added. A lesson agent writes a sentence
-- naming what its lesson actually taught, which is how the next lesson
-- agent knows what has been covered without being handed twelve full
-- bodies. The reader can write in it too, and theirs are marked as
-- theirs.
--
-- Deliberately its own table rather than columns on `curricula`. The
-- curricula row is read on the topic sheet, the home screen and the
-- route, none of which want a page of prose and a growing log; and the
-- plan is written on a different rhythm from the course -- once at the
-- draft, then again on every lesson.
--
-- Safe to run twice.

create table if not exists curriculum_plans (
  curriculum_id uuid primary key references curricula(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Why the course is shaped the way it is, in prose. Null until the
  -- drafting agent has written it, which is not the same as empty: a
  -- course drafted before this migration has no reasoning and never
  -- will, and the sheet should say so rather than print a blank.
  reasoning text,

  -- [{prompt, level, answer}], as `subject_sowings.qualifiers` holds
  -- them, frozen as of the moment this course was planned.
  qualifiers jsonb not null default '[]'::jsonb,

  -- [{at, by, kind, ref, body}] -- `by` is 'ai' or 'user', `kind` says
  -- what left it ('lesson', 'note'), `ref` is the lesson it is about
  -- where there is one. Appended to, never rewritten.
  entries jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists curriculum_plans_user_idx on curriculum_plans (user_id);

alter table curriculum_plans enable row level security;

drop policy if exists curriculum_plans_owner on curriculum_plans;
create policy curriculum_plans_owner on curriculum_plans for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Append one entry, and move `updated_at` with it.
--
-- A function rather than a read-modify-write in the app, because two
-- lesson agents finishing at once would otherwise each read the log,
-- add their line to what they read, and write back -- and the second
-- write would drop the first agent's line entirely. `||` on a jsonb
-- array inside a single statement cannot lose one that way.
--
-- `create or replace`, so this is safe to run twice.
create or replace function append_plan_entry(
  p_curriculum_id uuid,
  p_entry jsonb
)
returns void
language sql
as $$
  update curriculum_plans
  set entries = entries || jsonb_build_array(
        p_entry || jsonb_build_object('at', to_jsonb(now()))
      ),
      updated_at = now()
  where curriculum_id = p_curriculum_id;
$$;
