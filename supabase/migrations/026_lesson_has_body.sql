-- Whether a lesson has been written, without reading what it says.
--
-- A lesson body is written on first open and cached on the row, so
-- "has this been written yet" is a real and useful state -- it is the
-- difference between a lesson you can start now and one that has to be
-- asked for first. The topic sheet prints that state against every
-- lesson in the route, and the route it prints can be sixteen lessons
-- long.
--
-- Reading `body` to find out costs the whole prose of every lesson in
-- the topic, over the wire, to answer a question with one bit in it.
-- A stored generated column answers it from the row itself: Postgres
-- keeps it in step with `body` on every write, so it cannot drift the
-- way a boolean maintained by the application would.
--
-- Idempotent, like 025: a migration in the tree is not a migration on
-- a database, and this project's remote has been taken by hand before.
alter table lessons
  add column if not exists has_body boolean
  generated always as (body is not null and body <> '') stored;

-- The topic sheet asks for a curriculum's lessons in position order and
-- prints this against each. The existing (curriculum_id, position) index
-- already serves the lookup; this one serves the other direction -- the
-- lessons in a route that still need writing, which is what the generate
-- control on the topic sheet offers.
create index if not exists lessons_unwritten_idx
  on lessons (curriculum_id)
  where has_body = false;

comment on column lessons.has_body is
  'Derived from body. Never written directly: it is generated always.';
