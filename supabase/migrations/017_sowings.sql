-- What the user said about a subject when they sowed it.
--
-- The first ability figure for a brand-new subject is a self-report,
-- and PRODUCT.md requires every number to explain itself. Without this
-- the exposure log records "your own estimate" and nothing else: the
-- roots figure, the qualifying answers, and the evidence offered all
-- vanish the moment the bed is laid out. Keeping them makes the
-- starting figure reconstructible, and gives the subject sheet
-- something honest to print beside it.
--
-- Every column is nullable on purpose. The whole sheet is optional.
create table subject_sowings (
  subject_id uuid primary key references subjects(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  -- 0 is a real answer -- no prior knowledge -- and null means the
  -- slider was never touched. They are different facts.
  roots smallint check (roots between 0 and 5),
  confident text,
  gaps text,
  -- How far they said they want to take it. This is what decides
  -- whether the bed is broad and shallow or narrow and deep.
  depth text,
  -- [{prompt, level, answer}] as the qualifying set was answered.
  qualifiers jsonb not null default '[]'::jsonb,
  -- [{resource_id, title, kind}] for the proof they handed over.
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- The bucket `ingest` already downloads PDFs from. It has been assumed
-- since resources were added and never actually created, so uploading
-- evidence would have failed on a fresh stack.
insert into storage.buckets (id, name, public)
values ('resources', 'resources', false)
on conflict (id) do nothing;
