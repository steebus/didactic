-- What the reading of a resource has done so far, step by step.
--
-- The job row said where a resource had got to in a word (pending,
-- running, done, failed). The send sheet has room to say more while the
-- reader waits on it: the page fetched, what the model made of it, each
-- concept found and where it went on the map. The worker appends one
-- step to this list as it passes each point (`core/ingestProgress`); each
-- attempt starts a fresh one.
--
-- Written by the service role only, and read by the owner's own route,
-- so the table's existing policies cover it. Safe to run twice.

alter table ingestion_jobs
  add column if not exists progress jsonb not null default '[]'::jsonb;
