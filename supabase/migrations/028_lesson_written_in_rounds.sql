-- A lesson is written in rounds, so a body may be half of one.
--
-- Generating a full lesson takes longer than the sixty seconds the
-- platform allows a function, so it could not be done in one request at
-- all: the request was killed part way, the reader was told it had
-- failed, and nothing was kept. Each round is now its own request and
-- each one is saved, which means `body` can hold a lesson that stops
-- mid-sentence with more still to come.
--
-- That is the whole reason for `body_finished`. Without it a partial
-- body is indistinguishable from a whole one, and every sheet in the
-- app would print half a lesson as the finished article -- the topic
-- sheet would stamp it "Ready", the lesson sheet would stop asking for
-- the rest, and nothing would ever finish it.
--
-- `has_body` is redefined to mean what the sheets actually ask it:
-- there is a lesson here to read. A half-written one is not.
--
-- Idempotent throughout: Supabase applies these on the push to main, so
-- a migration that half-applies is a database nobody has looked at.
alter table lessons
  add column if not exists body_finished boolean not null default false;

-- How many model calls have gone into it. Kept so the reader can be
-- told, and so a lesson the model will not stop writing cannot bill
-- indefinitely -- the round cap is read from here.
alter table lessons
  add column if not exists body_rounds int not null default 0;

-- Everything written before rounds existed was written in one go, and
-- is complete by definition. Guarded on body_rounds so a re-run cannot
-- mark a genuinely unfinished lesson as done.
update lessons
  set body_finished = true, body_rounds = 1
  where body is not null and body <> '' and body_rounds = 0;

-- The index hangs off has_body, so it goes before the column can.
drop index if exists lessons_unwritten_idx;
alter table lessons drop column if exists has_body;

alter table lessons
  add column has_body boolean
  generated always as (body is not null and body <> '' and body_finished) stored;

-- Lessons in a route with nothing readable in them yet: what the topic
-- sheet's generate control offers, and now also what a half-written
-- lesson counts as until its last round lands.
create index if not exists lessons_unwritten_idx
  on lessons (curriculum_id)
  where has_body = false;

comment on column lessons.body_finished is
  'Whether body is the whole lesson. False while more rounds are still to come.';
comment on column lessons.body_rounds is
  'Model calls that have gone into body. Capped in the route.';
comment on column lessons.has_body is
  'Derived: there is a whole lesson here to read. Never written directly.';
