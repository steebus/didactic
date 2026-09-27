-- 061: where the reader wants to take a subject or a topic, and how
-- long a piece of material is.
--
-- The effort figure (`packages/core/src/grain.ts`) is the hours from
-- where the reader is to where they want to be. "Where they want to be"
-- was only ever free text -- `subject_sowings.depth`, in their own words,
-- read by the model laying out the bed -- so there was no number to
-- measure against. It is one now, on the subject, and on a topic where
-- the reader wants to go further or less far than its subject. Both are
-- intent, not evidence: setting one moves no figure the app owns. Unset,
-- the figure assumes a working knowledge (3) and says so.
--
-- A topic's own size leans on how much has been written about it alone,
-- so a kept body carries its word count. Counted here for the bodies
-- already kept, and by `keepBody` from now on.
--
-- Idempotent, like everything since 025: a migration merged to main is
-- applied on the push.

alter table subjects add column if not exists target_depth numeric(2,1);
alter table subjects drop constraint if exists subjects_target_depth_known;
alter table subjects add constraint subjects_target_depth_known
  check (target_depth is null or target_depth between 2 and 5);

alter table topics add column if not exists target_depth numeric(2,1);
alter table topics drop constraint if exists topics_target_depth_known;
alter table topics add constraint topics_target_depth_known
  check (target_depth is null or target_depth between 2 and 5);

alter table resource_bodies add column if not exists words int;
update resource_bodies
set words = case
  when btrim(body) = '' then 0
  else array_length(regexp_split_to_array(btrim(body), '\s+'), 1)
end
where words is null;

comment on column subjects.target_depth is
  'How far the reader wants to take this subject, on the ability scale (2 to 5). Intent, not evidence. Null: assumed 3.';
comment on column topics.target_depth is
  'A target for this topic alone, over its subjects''. Null: the highest of its subjects'' targets.';
comment on column resource_bodies.words is
  'The body''s length in words, for how much has been written about a topic.';
