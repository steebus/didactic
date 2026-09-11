-- How closely the thing grown from a document follows it.
--
-- The same question is asked in two places and the answer is stored
-- beside each: on `resource_subjects`, where a document was handed over
-- while sowing a subject, and on `curriculum_sources`, where it was
-- handed over to steer a route. Both joins already existed -- 023 and
-- 014 -- and both already carried everything except this.
--
-- Three values and not a number. Each is a different path through the
-- code rather than a different weight in a prompt, so a scale would be
-- promising an interpolation that does not exist:
--
--   verbatim -- the document's chapters are the topics, in its order.
--               The set and the nesting are fixed by the document; the
--               resolver still decides what each topic *is*, because a
--               topic is shared across every subject it sits under and
--               "Getting started" is not something anyone can know.
--   follow   -- the chapters seed the bed, and what the document skips
--               or doubles up on is put right.
--   source   -- the bed is laid out as usual, with the document's
--               coverage as context and its arrangement as a hint.
--
-- Null is the fourth case and needs no name: a document filed as
-- material, steering nothing. That is what filing has always done, and
-- every row written before this migration is exactly that.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'source_fidelity') then
    create type source_fidelity as enum ('verbatim', 'follow', 'source');
  end if;
end
$$;

alter table resource_subjects  add column if not exists fidelity source_fidelity;
alter table curriculum_sources add column if not exists fidelity source_fidelity;

comment on column resource_subjects.fidelity is
  'How closely the bed follows this document. Null means it steers nothing.';
comment on column curriculum_sources.fidelity is
  'How closely the route follows this document. Null means it steers nothing.';
