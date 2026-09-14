-- The learning diary.
--
-- A note, until now, was something written *at* a lesson: a passage
-- struck the reader and they said why, or they wrote a remark on the
-- lesson as a whole. Both are marks, and both belong to the lesson they
-- were taken from.
--
-- That is the wrong shape for the other thing a reader writes. "I
-- shipped an RLS policy at work this week and the `using` clause
-- finally made sense" is about three topics, none of which is the
-- lesson that happens to be open, and it is the strongest evidence this
-- app will ever get about what someone can actually do.
--
-- So a diary entry is a mark with no quote and no lesson. It is the
-- same row, and deliberately: `highlights` already carries a nullable
-- quote (020) and a nullable lesson (022, so a mark outlives what it
-- was taken from), and `highlight_tags` (024) already indexes the
-- topics and lessons a note names. A table of its own would have
-- duplicated the tag index, the search and the mention parser, and then
-- needed a union to put the two back into one timeline -- which is the
-- whole point of the sheet they are printed on.
--
-- Idempotent, like everything since 025.

-- What kind of thing this row is.
--
-- Defaulted to 'mark', which is what every row written before today
-- genuinely is: something kept while reading. No backfill, because
-- there is nothing to correct.
alter table highlights
  add column if not exists kind text not null default 'mark';

alter table highlights
  drop constraint if exists highlights_kind_known;

alter table highlights
  add constraint highlights_kind_known
    check (kind in ('mark', 'diary'));

-- An entry has nothing to anchor to.
--
-- A mark points at a passage in a lesson; an entry is a page about a
-- week. Checked here rather than trusted to the route, because the
-- phone writes rows directly under the owner's token and there is no
-- handler in front of it.
alter table highlights
  drop constraint if exists highlights_diary_stands_alone;

alter table highlights
  add constraint highlights_diary_stands_alone
    check (kind <> 'diary' or (quote is null and lesson_id is null));

-- The timeline reads every kind at once, newest first, and the topic
-- and subject sheets read one topic's entries the same way. Both are
-- the owner's whole history in date order, which is the one index
-- neither `highlights_lesson_idx` nor the tag indexes serve.
create index if not exists highlights_owner_recent_idx
  on highlights (user_id, created_at desc);
