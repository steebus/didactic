-- One-off cleanup for the sow-evidence redundancy (see migration 023).
--
-- Older sowings filed each piece of evidence against every topic in the
-- bed, so the same resource printed on every topic sheet. This moves
-- those per-topic links onto the subject and drops the copies. Run it
-- once, after migration 023 has created resource_subjects.
--
-- A row is treated as sow evidence when the resource it points at is
-- named in that subject's sowing record and the topic it is linked to
-- belongs to that subject. Manual topic links are never named in a
-- sowing, so they are left alone.

begin;

-- 1. See what will move (run this on its own first if you want a preview).
select
  s.title            as subject,
  r.title            as resource,
  count(*)           as topic_links_to_drop
from resource_topics rt
join topic_subjects  ts on ts.topic_id   = rt.topic_id
join subject_sowings ss on ss.subject_id = ts.subject_id
join subjects        s  on s.id          = ts.subject_id
join resources       r  on r.id          = rt.resource_id
where ss.evidence @> jsonb_build_array(jsonb_build_object('resourceId', rt.resource_id::text))
group by s.title, r.title
order by topic_links_to_drop desc;

-- 2. File each piece of evidence against its subject.
insert into resource_subjects (resource_id, subject_id, relevance, created_by)
select distinct rt.resource_id, ts.subject_id, 0.3, 'ai'::created_by_kind
from resource_topics rt
join topic_subjects  ts on ts.topic_id   = rt.topic_id
join subject_sowings ss on ss.subject_id = ts.subject_id
where ss.evidence @> jsonb_build_array(jsonb_build_object('resourceId', rt.resource_id::text))
on conflict (resource_id, subject_id) do nothing;

-- 3. Drop the per-topic copies.
delete from resource_topics rt
using topic_subjects ts, subject_sowings ss
where ts.topic_id   = rt.topic_id
  and ss.subject_id = ts.subject_id
  and ss.evidence @> jsonb_build_array(jsonb_build_object('resourceId', rt.resource_id::text));

commit;
