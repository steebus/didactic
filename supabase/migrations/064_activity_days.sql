-- 064: what the reader did, counted by day, subject and kind.
--
-- The activity rule under the home masthead draws a year of it. Every
-- kind already has a timestamped row of its own, so this is a read and
-- not a log: a finished lesson, a resource read and a resource added (`added_at`),
-- a passage marked, a flashcard reviewed, and the exposures that have
-- no other row (an answer to a lesson's question, a diary entry). The
-- exposures written by finishing a lesson, reading a resource or
-- marking a passage are left out, since those are already counted from
-- their own rows.
--
-- It counts and does not weigh: the weights are `core/config.ACTIVITY`,
-- where changing one is not a migration. A day is cut in `p_tz`, since
-- the database runs in UTC and a mark at half past midnight belongs to
-- the day the reader was living in.
--
-- The subject is the topic's home (`primary_subject_id`); a resource
-- takes the first subject it is filed under. Null where there is none.
--
-- Idempotent, like everything since 025: `create or replace`.
-- The design is `docs/superpowers/specs/2026-09-28-activity-rule-design.md`.

create or replace function activity_days(p_since date, p_tz text)
returns table (day date, subject_id uuid, kind text, n int)
language sql
stable
security invoker
set search_path = public
as $$
  with events (at, subject_id, kind) as (
    select l.completed_at, t.primary_subject_id, 'lesson'
      from lessons l
      left join curricula c on c.id = l.curriculum_id
      left join topics t on t.id = coalesce(l.topic_id, c.topic_id)
     where l.completed_at is not null

    union all
    select r.consumed_at,
           (select rs.subject_id from resource_subjects rs
             where rs.resource_id = r.id order by rs.subject_id limit 1),
           'read'
      from resources r
     where r.consumed_at is not null

    union all
    select r.added_at,
           (select rs.subject_id from resource_subjects rs
             where rs.resource_id = r.id order by rs.subject_id limit 1),
           'added'
      from resources r

    union all
    select h.created_at, t.primary_subject_id, 'mark'
      from highlights h
      left join topics t on t.id = h.topic_id

    union all
    select e.created_at, t.primary_subject_id, 'answer'
      from exposures e
      join topics t on t.id = e.topic_id
     where e.source::text = 'diary' or e.depth::text = 'answered'

    union all
    select cr.reviewed_at, t.primary_subject_id, 'card'
      from cloze_reviews cr
      join clozes cz on cz.id = cr.cloze_id
      left join topics t on t.id = cz.topic_id
  )
  select (at at time zone p_tz)::date as day, subject_id, kind, count(*)::int as n
    from events
   where at >= (p_since::timestamp at time zone p_tz)
   group by 1, 2, 3
$$;

comment on function activity_days(date, text) is
  'Events per day, subject and kind since p_since, days cut in p_tz. Weighed in core/activity.';
