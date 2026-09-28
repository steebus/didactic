-- 065: the reader's activity inside one subject, or one topic and what
-- hangs under it.
--
-- The subject and topic sheets carry the same rule under their band as
-- the home sheet does (064), filtered to their own ground:
--
--   a subject: every topic filed in it (not only those it is home to),
--     and every resource filed under it or linked to one of those topics;
--   a topic: the topic and everything under it -- walked down `prereq`
--     and `specialises`, the same walk promoting a topic takes (062) --
--     and every resource linked to one of those.
--
-- Counted exactly as `activity_days` counts: the same six kinds, the
-- same exposures left out. Pass one of `p_subject` and `p_topic`. The
-- subject column is null throughout, since on a sheet that is all one
-- subject there is nothing to colour by.
--
-- Idempotent, like everything since 025: `create or replace`.
-- The design is `docs/superpowers/specs/2026-09-28-activity-rule-design.md`.

create or replace function activity_days_in(p_subject uuid, p_topic uuid, p_since date, p_tz text)
returns table (day date, subject_id uuid, kind text, n int)
language sql
stable
security invoker
set search_path = public
as $$
  with recursive below as (
    select p_topic as id where p_topic is not null
    union
    select e.to_topic
      from edges e
      join below b on e.from_topic = b.id
     where e.kind in ('prereq', 'specialises')
  ),
  scope (id) as (
    select id from below
    union
    select ts.topic_id from topic_subjects ts where ts.subject_id = p_subject
  ),
  scoped_resources (id) as (
    select rt.resource_id from resource_topics rt join scope s on s.id = rt.topic_id
    union
    select rs.resource_id from resource_subjects rs where rs.subject_id = p_subject
  ),
  events (at, kind) as (
    select l.completed_at, 'lesson'
      from lessons l
      left join curricula c on c.id = l.curriculum_id
     where l.completed_at is not null
       and coalesce(l.topic_id, c.topic_id) in (select id from scope)

    union all
    select r.consumed_at, 'read'
      from resources r
     where r.consumed_at is not null and r.id in (select id from scoped_resources)

    union all
    select r.added_at, 'added'
      from resources r
     where r.id in (select id from scoped_resources)

    union all
    select h.created_at, 'mark'
      from highlights h
     where h.topic_id in (select id from scope)

    union all
    select e.created_at, 'answer'
      from exposures e
     where e.topic_id in (select id from scope)
       and (e.source::text = 'diary' or e.depth::text = 'answered')

    union all
    select cr.reviewed_at, 'card'
      from cloze_reviews cr
      join clozes cz on cz.id = cr.cloze_id
     where cz.topic_id in (select id from scope)
  )
  select (at at time zone p_tz)::date as day, null::uuid as subject_id, kind, count(*)::int as n
    from events
   where at >= (p_since::timestamp at time zone p_tz)
   group by 1, 3
$$;

comment on function activity_days_in(uuid, uuid, date, text) is
  'activity_days inside one subject, or one topic and everything under it. Weighed in core/activity.';
