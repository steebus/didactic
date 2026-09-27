-- 060: whether a resource is filed as one topic or by its parts.
--
-- The reading files a resource under every learnable concept it finds,
-- which is right for a survey or a book and wrong for a tutorial on one
-- thing: "Bloom Filter in Python" became Hash Functions, Set Membership
-- Testing, Probabilistic Data Structures and more, bare names the reader
-- never set out to learn. The reading now also says whether a piece is
-- about one thing, and files it under that one topic if so
-- (`packages/core/src/whole.ts`).
--
-- This is the reader's say over that: 'whole' files it as one topic
-- whatever the reading thought, 'parts' by what it covers, and null
-- leaves it to the reading. Set from the add form, or from the resource
-- sheet, which files the resource again the other way.
--
-- Idempotent, like everything since 025: a migration merged to main is
-- applied on the push.

alter table resources
  add column if not exists filing text;

alter table resources
  drop constraint if exists resources_filing_known;

alter table resources
  add constraint resources_filing_known
    check (filing is null or filing in ('whole', 'parts'));

comment on column resources.filing is
  'The reader''s say: ''whole'' files it as one topic, ''parts'' by what it covers, null leaves it to the reading.';
