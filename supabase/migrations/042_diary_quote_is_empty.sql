-- An entry has no passage, and "no passage" here is an empty string.
--
-- 040 wrote the constraint as `quote is null`, which is what a column
-- holding nothing ought to mean and is not what this column does:
-- `highlights.quote` has been `not null` since 020, and a note on a
-- lesson as a whole -- the other kind of mark with nothing quoted --
-- has always been stored as `''`. So the constraint could never be
-- satisfied, and every entry was refused by the database.
--
-- Corrected rather than relaxed. The point of the check is that an
-- entry is not anchored to anything: it is a page about a week, not a
-- thought about a sentence. That claim is still worth enforcing where
-- the phone writes rows directly under the owner's token with no route
-- handler in front of it -- it is only the spelling of "nothing" that
-- was wrong.
--
-- 040 has been merged and applied, so it is not edited: this is the
-- correction, in its own file, and it is safe to run twice.
alter table highlights
  drop constraint if exists highlights_diary_stands_alone;

alter table highlights
  add constraint highlights_diary_stands_alone
    check (kind <> 'diary' or (quote = '' and lesson_id is null));
