-- 057: which importer made an article's readable body.
--
-- An article is brought into the app once (053) and kept, so a fix to
-- the importer reached only articles saved after it. The first such fix
-- keeps a page's line breaks -- a poem had come in as one run-on line --
-- and its pop-up notes, which had been dropped with the links that held
-- them. So a body is stamped with the importer that made it, and an
-- article kept by an older one is made again the next time it is opened
-- (`apps/web/src/lib/resourceBody.ts`, `IMPORTER` in
-- `apps/web/src/lib/extract/markdown.ts`). If its page cannot be read
-- by then, the body it had is kept and stamped as tried, so a page that
-- has gone is not fetched again on every open.
--
-- Every body already kept was made by the first importer. Nothing is
-- deleted here: a mark is kept as the words it quotes, not a place in
-- the body (020), so a body made again finds every mark it had.
--
-- Idempotent, like everything since 025: a migration merged to main is
-- applied on the push.

alter table resource_bodies
  add column if not exists made_with smallint not null default 1;

comment on column resource_bodies.made_with is
  'The importer that made this body, or last tried to make it again. An article stamped older than the app runs is made again when next opened.';
