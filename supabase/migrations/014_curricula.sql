-- A curriculum is a route through one topic, introductory to advanced.
-- A topic may carry several: "React, from scratch" and "React for
-- someone who already writes Vue" are different routes over the same
-- ground.
--
-- Linear and branching are the same storage. `position` orders siblings
-- for display; `lesson_prereqs` decides what is actually reachable. A
-- linear curriculum is the degenerate case where each lesson requires
-- exactly the one before it. Nothing about availability is stored --
-- like freshness, it is derived at read time.

create type curriculum_shape as enum ('linear', 'branching');
create type curriculum_status as enum ('draft', 'active', 'archived');
create type lesson_stage as enum ('introductory', 'core', 'advanced');

create table curricula (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  topic_id uuid not null references topics(id) on delete cascade,
  title text not null,
  -- What the user said they wanted out of it, in their words. It is the
  -- brief a regeneration has to keep serving.
  goal text,
  shape curriculum_shape not null default 'linear',
  status curriculum_status not null default 'draft',
  created_by created_by_kind not null,
  -- The user's final say. A draft is the agent's proposal and nothing
  -- more; only an approved curriculum is a plan. PRODUCT.md principle 5.
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index curricula_topic_idx on curricula (topic_id, status);

-- Reference material the user handed over to steer generation: a book
-- they trust, a PDF syllabus, a roadmap they want followed. Distinct
-- from lesson_resources, which is what a lesson asks you to go and read.
create table curriculum_sources (
  curriculum_id uuid not null references curricula(id) on delete cascade,
  resource_id uuid not null references resources(id) on delete cascade,
  -- Why this was handed over: "follow this order", "ignore chapter 4".
  note text,
  created_at timestamptz not null default now(),
  primary key (curriculum_id, resource_id)
);

create table lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  curriculum_id uuid not null references curricula(id) on delete cascade,
  -- The concept this lesson teaches, where it maps onto one. Completing
  -- the lesson writes an exposure against this topic, which is the only
  -- way a curriculum moves the map. Null means the lesson is scaffolding
  -- -- an orientation or a recap -- and moves nothing.
  topic_id uuid references topics(id) on delete set null,
  title text not null,
  slug text not null,
  summary text,
  -- Written on demand and cached here. Null means "not written yet",
  -- which is the normal state of a lesson you have not reached.
  body text,
  position int not null,
  stage lesson_stage not null default 'core',
  estimated_minutes int,
  created_by created_by_kind not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (curriculum_id, slug)
);

create index lessons_curriculum_idx on lessons (curriculum_id, position);
create index lessons_topic_idx on lessons (topic_id);

-- Branching lives here, and only here. A branching curriculum has
-- several roots and several tips; a linear one is a single chain. Both
-- read the same way: a lesson is available when everything it requires
-- is complete.
create table lesson_prereqs (
  lesson_id uuid not null references lessons(id) on delete cascade,
  requires_lesson_id uuid not null references lessons(id) on delete cascade,
  primary key (lesson_id, requires_lesson_id),
  constraint lesson_prereqs_not_self check (lesson_id <> requires_lesson_id)
);

create index lesson_prereqs_requires_idx on lesson_prereqs (requires_lesson_id);

-- What the lesson sends you to read. These are ordinary resources, so
-- consuming one writes its own exposure through the existing path.
create table lesson_resources (
  lesson_id uuid not null references lessons(id) on delete cascade,
  resource_id uuid not null references resources(id) on delete cascade,
  relevance numeric(3,2) not null default 1.0,
  primary key (lesson_id, resource_id)
);

-- merge_topics predates curricula, so it does not know to re-point
-- them. Without this, merging a duplicate topic would cascade its
-- curricula and lessons into nothing.
create or replace function merge_topics(p_from uuid, p_into uuid)
returns void
language plpgsql
as $$
begin
  if p_from = p_into then
    raise exception 'merge_topics: cannot merge a topic into itself';
  end if;

  -- Keep the stronger link where both topics share a resource.
  update resource_topics rt_into
  set relevance = greatest(rt_into.relevance, rt_from.relevance)
  from resource_topics rt_from
  where rt_from.topic_id = p_from
    and rt_into.topic_id = p_into
    and rt_from.resource_id = rt_into.resource_id;

  delete from resource_topics rt_from
  where rt_from.topic_id = p_from
    and exists (
      select 1 from resource_topics rt_into
      where rt_into.topic_id = p_into
        and rt_into.resource_id = rt_from.resource_id
    );

  update resource_topics set topic_id = p_into where topic_id = p_from;
  update exposures set topic_id = p_into where topic_id = p_from;
  update conversations set topic_id = p_into where topic_id = p_from;

  -- Curricula and the lessons that teach the duplicate follow it home.
  update curricula set topic_id = p_into where topic_id = p_from;
  update lessons set topic_id = p_into where topic_id = p_from;

  -- The survivor inherits every subject the duplicate was filed under.
  insert into topic_subjects (topic_id, subject_id, created_by)
  select p_into, subject_id, created_by from topic_subjects where topic_id = p_from
  on conflict do nothing;
  delete from topic_subjects where topic_id = p_from;

  -- Edges: re-point, then drop self-edges and duplicates the move created.
  update edges set from_topic = p_into where from_topic = p_from;
  update edges set to_topic = p_into where to_topic = p_from;
  delete from edges where from_topic = to_topic;

  delete from edges e
  where e.id not in (
    select min(e2.id::text)::uuid
    from edges e2
    group by e2.from_topic, e2.to_topic, e2.kind
  );

  delete from topics where id = p_from;
end;
$$;
