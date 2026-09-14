-- A topic is sometimes the wrong size.
--
-- Ingestion files what it reads at one level, and it cannot know which
-- of those is a subject you will spend a year in and which is a
-- paragraph inside something else. "Economic history" arrives as a
-- topic beside "Defensive vs Enterprising Investor"; one is a bed and
-- the other is a lesson. Until now the only remedies were merging two
-- topics or grubbing one out, and neither changes what level a thing
-- sits at.
--
-- Both of these are gated on the same condition: **a topic with a
-- curriculum cannot be moved between levels.** A route through a topic
-- is a plan someone approved and is working, with lessons that have
-- been written, opened and completed against it, and rehoming that is a
-- different and much larger operation than either of these. The gate is
-- in the database rather than in the route because it is the invariant,
-- not a policy of one caller -- and because it is what makes the rest
-- of this file simple enough to be safe: no lessons to re-parent, no
-- prereq graph to rewrite, no approved plan to invalidate.
--
-- Safe to run twice: `create or replace`, and both functions raise
-- rather than half-apply.

-- Everything a topic can still be holding when it has no curriculum:
-- resources filed against it, exposures from reading them, diary
-- entries filed under it, tags naming it, and its place in the outline.
-- None of it is destroyed by either function below.

create or replace function topic_has_a_route(p_topic uuid)
returns boolean
language sql stable
as $$
  select exists (select 1 from curricula where topic_id = p_topic);
$$;

/**
 * Promote a topic to a subject.
 *
 * The topic row survives, and that is not a compromise -- it is forced,
 * and rightly. `exposures.topic_id` is not null and there is no subject
 * equivalent: a subject is not something you can have read. A topic with
 * no curriculum can still carry a reading log, marked passages and the
 * material that produced them, so consuming the row to avoid a subject
 * and a topic sharing a name would destroy the one record this app
 * claims to keep honestly. It is named the same twice, and everything is
 * still there.
 *
 * What moves is the bed around it: the topic and everything sitting
 * under it in the outline are filed into the new subject and take it as
 * their home, which is the ink the graph draws them in. Old memberships
 * are left alone -- promoting is additive, and `Take out` is how you
 * finish the job if the old bed should no longer hold them.
 */
create or replace function promote_topic_to_subject(
  p_topic uuid,
  p_colour text
)
returns uuid
language plpgsql
as $$
declare
  v_owner uuid;
  v_title text;
  v_subject uuid;
begin
  select user_id, title into v_owner, v_title from topics where id = p_topic;

  if v_owner is null then
    raise exception 'promote_topic_to_subject: no such topic';
  end if;

  if topic_has_a_route(p_topic) then
    raise exception
      'promote_topic_to_subject: "%" has a route through it. A topic carrying a curriculum cannot change level.',
      v_title;
  end if;

  insert into subjects (user_id, title, colour)
  values (v_owner, v_title, p_colour)
  returning id into v_subject;

  -- The topic, and everything the outline hangs under it. One level of
  -- descent is walked transitively: a bed is a shallow tree and a
  -- recursive walk over `edges` is the same reading the outline does.
  with recursive below as (
    select p_topic as id
    union
    select e.to_topic
    from edges e
    join below b on e.from_topic = b.id
    where e.kind in ('prereq', 'specialises')
  )
  insert into topic_subjects (topic_id, subject_id, created_by)
  select id, v_subject, 'user' from below
  on conflict do nothing;

  -- The new bed is their home: what the graph colours them by, and what
  -- they fall back to if every other filing is taken away.
  update topics t
  set primary_subject_id = v_subject
  where exists (
    select 1 from topic_subjects ts
    where ts.topic_id = t.id and ts.subject_id = v_subject
  );

  return v_subject;
end;
$$;

/**
 * Demote a topic into another topic's route, as a lesson in it.
 *
 * The mirror of promoting, and the destructive one: the topic's whole
 * history is moved onto the target first and the row is then deleted, so
 * nothing is lost but the name -- and the name survives as the lesson's
 * title, which is the point. It is the same set of moves `merge_topics`
 * makes, for the same reason, with one addition: a lesson is written to
 * stand where the topic did.
 *
 * The lesson's body is left unwritten. The app writes bodies on demand
 * and a demoted topic has no prose of its own to carry over, so
 * inventing one here would be the database making something up.
 *
 * Where the target has no route at all, a draft one is started. A draft
 * is a proposal and nothing more until it is approved, which is the
 * honest standing for a route that came into being as a side effect of
 * filing something.
 */
create or replace function demote_topic_into(
  p_topic uuid,
  p_into uuid
)
returns uuid
language plpgsql
as $$
declare
  v_owner uuid;
  v_title text;
  v_summary text;
  v_into_title text;
  v_curriculum uuid;
  v_lesson uuid;
  v_position int;
  v_slug text;
begin
  if p_topic = p_into then
    raise exception 'demote_topic_into: cannot demote a topic into itself';
  end if;

  select user_id, title, summary into v_owner, v_title, v_summary
  from topics where id = p_topic;
  select title into v_into_title from topics where id = p_into;

  if v_owner is null or v_into_title is null then
    raise exception 'demote_topic_into: no such topic';
  end if;

  if topic_has_a_route(p_topic) then
    raise exception
      'demote_topic_into: "%" has a route through it. A topic carrying a curriculum cannot change level.',
      v_title;
  end if;

  -- The route it is joining: the one being worked, else a draft awaiting
  -- approval, else a new draft.
  select id into v_curriculum
  from curricula
  where topic_id = p_into
  order by case status when 'active' then 0 when 'draft' then 1 else 2 end, created_at
  limit 1;

  if v_curriculum is null then
    insert into curricula (user_id, topic_id, title, status, created_by)
    values (v_owner, p_into, v_into_title, 'draft', 'user')
    returning id into v_curriculum;
  end if;

  select coalesce(max(position), 0) + 1 into v_position
  from lessons where curriculum_id = v_curriculum;

  -- Slugs are unique per curriculum; suffix rather than fail, exactly as
  -- `commit_ingestion` does for topic slugs.
  v_slug := regexp_replace(lower(v_title), '[^a-z0-9]+', '-', 'g')
    || '-' || substr(gen_random_uuid()::text, 1, 4);

  insert into lessons (
    user_id, curriculum_id, topic_id, title, slug, summary, position, created_by
  )
  values (
    v_owner, v_curriculum, p_into, v_title, v_slug, v_summary, v_position, 'user'
  )
  returning id into v_lesson;

  -- Everything the topic was holding moves to the target, the way a
  -- merge moves it. Keep the stronger link where both share a resource.
  update resource_topics rt_into
  set relevance = greatest(rt_into.relevance, rt_from.relevance)
  from resource_topics rt_from
  where rt_from.topic_id = p_topic
    and rt_into.topic_id = p_into
    and rt_from.resource_id = rt_into.resource_id;

  -- What the demoted topic was read from becomes what the new lesson
  -- sends you to read. Filed before the rows move, while they still
  -- name the topic they came from.
  insert into lesson_resources (lesson_id, resource_id, relevance)
  select v_lesson, rt.resource_id, rt.relevance
  from resource_topics rt
  where rt.topic_id = p_topic
  on conflict do nothing;

  delete from resource_topics rt_from
  where rt_from.topic_id = p_topic
    and exists (
      select 1 from resource_topics rt_into
      where rt_into.topic_id = p_into
        and rt_into.resource_id = rt_from.resource_id
    );

  update resource_topics set topic_id = p_into where topic_id = p_topic;
  update exposures set topic_id = p_into where topic_id = p_topic;
  update conversations set topic_id = p_into where topic_id = p_topic;
  update highlights set topic_id = p_into where topic_id = p_topic;
  update cloze_concepts set topic_id = p_into where topic_id = p_topic;
  update clozes set topic_id = p_into where topic_id = p_topic;

  delete from highlight_tags t
  where t.topic_id = p_topic
    and exists (
      select 1 from highlight_tags k
      where k.highlight_id = t.highlight_id and k.topic_id = p_into
    );

  update highlight_tags set topic_id = p_into where topic_id = p_topic;

  insert into topic_subjects (topic_id, subject_id, created_by)
  select p_into, subject_id, created_by from topic_subjects where topic_id = p_topic
  on conflict do nothing;
  delete from topic_subjects where topic_id = p_topic;

  -- Edges, cleared before they move, exactly as `043` clears them: the
  -- unique constraint is checked per statement, so a collision has to be
  -- gone before the re-point rather than after it.
  delete from edges
  where (from_topic = p_topic or to_topic = p_topic)
    and (case when from_topic = p_topic then p_into else from_topic end)
      = (case when to_topic = p_topic then p_into else to_topic end);

  delete from edges e
  where (e.from_topic = p_topic or e.to_topic = p_topic)
    and exists (
      select 1 from edges k
      where k.from_topic <> p_topic
        and k.to_topic <> p_topic
        and k.kind = e.kind
        and k.from_topic = (case when e.from_topic = p_topic then p_into else e.from_topic end)
        and k.to_topic = (case when e.to_topic = p_topic then p_into else e.to_topic end)
    );

  update edges
  set from_topic = case when from_topic = p_topic then p_into else from_topic end,
      to_topic = case when to_topic = p_topic then p_into else to_topic end
  where from_topic = p_topic or to_topic = p_topic;

  delete from topics where id = p_topic;

  return v_lesson;
end;
$$;
