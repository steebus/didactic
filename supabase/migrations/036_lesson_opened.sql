-- When a lesson was first opened.
--
-- The topic sheet prints a standing against every lesson in a route,
-- and until now the rung between *written and waiting* and *finished*
-- rested on marks: a lesson counted as worked-in only if the reader had
-- kept a passage from it. `lessonState` has always said out loud that
-- this under-reports, because someone can read a lesson closely and
-- mark nothing, and that reader's route looked untouched.
--
-- So the app records the one thing it was not recording: that the
-- reader was here. Nullable, because most lessons in a route have never
-- been opened and null is the honest answer for them -- and because
-- every lesson written before this migration has genuinely never been
-- opened *as far as anything knows*, which is what null says and a
-- backfilled timestamp would not.
--
-- Written once and never moved. It is the first time, not the last: a
-- lesson opened again is not opened again for the first time, and the
-- sheet has `completed_at` for the other end. Enforced where it is set
-- rather than by a trigger -- the update names `opened_at is null` --
-- so the column stays a plain timestamp that a migration or a repair
-- can correct by hand.
--
-- Idempotent, like everything since 025.
alter table lessons
  add column if not exists opened_at timestamptz;

comment on column lessons.opened_at is
  'When the reader first opened this lesson. Never moved once set: it is the first time, not the last. Null means never opened, including for every lesson that predates this column.';
