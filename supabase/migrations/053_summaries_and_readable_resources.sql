-- Summaries in the reader's own words, and material read in the app.
--
-- Two things that share one table, because they share one idea: what a
-- reader writes while reading is a mark, whatever it was written at.
--
-- **A summary is a mark of kind `summary`.** Saying back what a section
-- said, in your own words, is the best-evidenced study habit there is,
-- and the row it needs is the row a note on the lesson already is: no
-- passage, a note, a lesson and a topic. What it adds is *which part*
-- it summarises -- a section, named by its heading, or the whole thing
-- when `section` is null -- and where that section sits in the reading,
-- so a list of them can be printed in the order the lesson runs rather
-- than the order they were written. Kept on `highlights` rather than in
-- a table of its own for the reason 040 gives for the diary: the tag
-- index, the search, the mention parser and the Marked sheet all come
-- with the row, and a second table would need every one of them again.
--
-- **Material can be read here, and marked where it is read.** Until now
-- a resource was filed and then read somewhere else -- the article on
-- its own site, the PDF in the browser's viewer -- and anything the
-- reader kept from it had nowhere to go. So a resource gets a readable
-- body, made once from what ingestion already knows how to get (the
-- article's readable text, the note as pasted, the document's
-- passages), and a mark, a summary or a cloze can now belong to a
-- resource instead of a lesson.
--
-- The body is a table of its own rather than a column on `resources`:
-- the inbox reads `resources.*` for every row on the shelf, and a
-- column holding each article's whole text would be carried to a list
-- that prints only titles.
--
-- Idempotent throughout, like everything since 025: a migration merged
-- to main is applied on the push.

-- ------------------------------------------------------------ marks

alter table highlights
  add column if not exists section text;

alter table highlights
  add column if not exists section_at int;

-- `set null`, as a lesson is (022): what a reader wrote outlives the
-- thing it was written at. A summary of an article that has since been
-- thrown away is still their summary.
alter table highlights
  add column if not exists resource_id uuid references resources(id) on delete set null;

alter table highlights
  drop constraint if exists highlights_kind_known;

alter table highlights
  add constraint highlights_kind_known
    check (kind in ('mark', 'diary', 'summary'));

-- A summary quotes nothing: it is the reader's words, not the text's.
alter table highlights
  drop constraint if exists highlights_summary_quotes_nothing;

alter table highlights
  add constraint highlights_summary_quotes_nothing
    check (kind <> 'summary' or quote = '');

-- Only a summary is of a section.
alter table highlights
  drop constraint if exists highlights_section_is_a_summary;

alter table highlights
  add constraint highlights_section_is_a_summary
    check (section is null or kind = 'summary');

-- A mark was taken in one place: a lesson or a resource, never both.
alter table highlights
  drop constraint if exists highlights_one_place;

alter table highlights
  add constraint highlights_one_place
    check (num_nonnulls(lesson_id, resource_id) <= 1);

-- An entry stands alone (040, 042), and that now includes a resource.
alter table highlights
  drop constraint if exists highlights_diary_stands_alone;

alter table highlights
  add constraint highlights_diary_stands_alone
    check (kind <> 'diary' or (quote = '' and lesson_id is null and resource_id is null));

create index if not exists highlights_resource_idx
  on highlights (resource_id)
  where resource_id is not null;

-- One summary per section. Writing another replaces the last, which is
-- what the route does; this is what makes a double press unable to
-- leave two. Partial on the parent being there: a summary whose lesson
-- has gone is not a duplicate of another whose lesson has gone.
create unique index if not exists highlights_one_summary_per_lesson_section
  on highlights (lesson_id, coalesce(section, ''))
  where kind = 'summary' and lesson_id is not null;

create unique index if not exists highlights_one_summary_per_resource_section
  on highlights (resource_id, coalesce(section, ''))
  where kind = 'summary' and resource_id is not null;

comment on column highlights.section is
  'On a summary: the heading of the section it summarises, as the reader saw it. Null for a summary of the whole lesson or resource.';
comment on column highlights.section_at is
  'On a section summary: which heading it is, counting from nought, so summaries list in reading order.';
comment on column highlights.resource_id is
  'The resource this was taken in, where it was read in the app. Exclusive with lesson_id.';

-- ------------------------------------------------------------ bodies

create table if not exists resource_bodies (
  resource_id uuid primary key references resources(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  -- Markdown, as a lesson body is, so the same reader prints it.
  body text not null,
  -- Where it came from: 'article' (the page's readable text), 'note'
  -- (as pasted) or 'document' (the passages a PDF was cut into).
  source text not null,
  created_at timestamptz not null default now()
);

alter table resource_bodies enable row level security;
drop policy if exists resource_bodies_owner on resource_bodies;
create policy resource_bodies_owner on resource_bodies for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table resource_bodies is
  'A resource made readable in the app, once, from what ingestion can get at. Absent where nothing could be.';

-- ------------------------------------------------------------ clozes

-- A cloze can be cut from a resource as well as from a lesson.
alter table clozes
  alter column lesson_id drop not null;

-- Cascades, as a lesson does (035): a card cut from something that is
-- gone asks about nothing the reader can go back to.
alter table clozes
  add column if not exists resource_id uuid references resources(id) on delete cascade;

alter table clozes
  drop constraint if exists clozes_one_source;

alter table clozes
  add constraint clozes_one_source
    check (num_nonnulls(lesson_id, resource_id) = 1);

create index if not exists clozes_resource_idx
  on clozes (resource_id)
  where resource_id is not null;
