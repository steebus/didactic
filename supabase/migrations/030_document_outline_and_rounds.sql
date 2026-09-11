-- What a document says its own shape is, and how far through it we are.
--
-- Two halves of one problem. A bed sown from a document needs to know
-- what its chapters are; and a document long enough to be worth sowing
-- from cannot be read inside the sixty seconds the platform allows a
-- function, so reading it has to be resumable.
--
-- The second is the same problem `028` solved for lesson bodies and it
-- gets the same answer: a cursor on the job, a round that does what
-- fits and saves it, and a flag that says whether what is there is the
-- whole thing. Without that flag a half-read document is
-- indistinguishable from a finished one, and a bed would be laid out
-- from the first forty pages of a book as though that were the book.

create table if not exists resource_outline (
  resource_id uuid primary key references resources(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  -- [{title, pageFrom, pageTo, children: [...]}], nested as the
  -- document nests. Shaped by core/passages.OutlineEntry, and kept as
  -- jsonb rather than as rows because nothing ever queries into it --
  -- it is read whole, by the sower and by the passage cutter.
  chapters jsonb not null default '[]'::jsonb,
  -- Where the shape came from, which is worth keeping because the two
  -- sources are not equally trustworthy and the sheet says which:
  --   'bookmarks' -- the document's own outline. Exact.
  --   'model'     -- read off the contents pages. Usually right.
  --   'none'      -- no structure could be found. The bed cannot be
  --                  laid out to the letter from this, and the sowing
  --                  sheet says so rather than pretending.
  source text not null default 'none',
  page_count int,
  created_at timestamptz not null default now()
);

alter table resource_outline enable row level security;
drop policy if exists resource_outline_owner on resource_outline;
create policy resource_outline_owner on resource_outline for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The cursor. A round reads from `pages_done` and writes it on.
alter table ingestion_jobs add column if not exists pages_done int not null default 0;
alter table ingestion_jobs add column if not exists page_count int;

-- Milliseconds per page, measured on this document rather than guessed.
-- A page of a novel and a page of a manual are not the same work, and
-- the only honest estimate of how much of the next round's minute a
-- page will cost is what the last round's pages actually cost.
alter table ingestion_jobs add column if not exists ms_per_page int;

-- Everything queued before rounds existed was read in one go, so there
-- is no cursor to resume and nothing to migrate: `pages_done` at zero
-- with `page_count` null is exactly "not a document being read in
-- rounds", which is what those rows are.

comment on column ingestion_jobs.pages_done is
  'Pages of a PDF read so far. The resume point for the next round.';
comment on column ingestion_jobs.page_count is
  'Pages in the document. Null until the first round has opened it.';
comment on column ingestion_jobs.ms_per_page is
  'Measured cost of a page in this document, used to size the next round.';
comment on column resource_outline.source is
  'bookmarks | model | none — where the chapter list came from, and how far to trust it.';
