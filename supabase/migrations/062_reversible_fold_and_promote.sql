-- 062: folding a topic into another's route, and promoting one to a
-- subject, both undoable.
--
-- Demoting a topic (044) moved everything it held onto the topic it was
-- folded into -- material, reading log, marks, cards, memberships,
-- edges -- and then deleted the row. Nothing recorded what had moved,
-- so it could not be undone, and deleting the row also set to null the
-- topic of any lesson in *another* route that taught it: completing
-- those lessons silently stopped moving the map.
--
-- `fold_topic_into` makes the same moves, so the topic it is folded into
-- keeps the history, and records every one of them in `topic_folds`
-- with the row as it stood. Lessons elsewhere that taught the folded
-- topic are pointed at the one it went into rather than at nothing.
-- `unfold_topic` puts every recorded row back, including the relevance
-- the fold raised on shared material, restores the row with its
-- memberships and edges, and moves back the exposures written since
-- against the lesson the fold made. That lesson is dropped if nobody
-- has worked it, and otherwise kept, teaching the unfolded topic.
--
-- Promoting (044) already kept the topic row and everything on it; what
-- it lacked was the way back. `subject_promotions` records each topic's
-- home before the promotion, and `unpromote_subject` restores those
-- homes and removes the subject. Exposures and edges are never touched
-- by either.
--
-- `demote_topic_into` is left as it was, for any build still calling it.
-- The design is `docs/superpowers/specs/2026-09-27-grain-and-complexity-design.md`.
--
-- Idempotent, like everything since 025: a migration merged to main is
-- applied on the push.

-- ------------------------------------------------------------ folds

create table if not exists topic_folds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  -- The folded topic's id. Not a foreign key: the row is gone until the
  -- fold is undone, and comes back with this id.
  topic_id uuid not null,
  -- The fold is undone into this topic's history, so it cannot outlive it.
  into_id uuid not null references topics(id) on delete cascade,
  lesson_id uuid references lessons(id) on delete set null,
  curriculum_id uuid references curricula(id) on delete set null,
  made_curriculum boolean not null default false,
  -- The folded row as it stood.
  snapshot jsonb not null,
  -- Every row the fold moved, and how it stood before.
  ledger jsonb not null,
  folded_at timestamptz not null default now(),
  unfolded_at timestamptz
);

create index if not exists topic_folds_into_idx on topic_folds (into_id) where unfolded_at is null;

alter table topic_folds enable row level security;
drop policy if exists topic_folds_owner on topic_folds;
create policy topic_folds_owner on topic_folds for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table topic_folds is
  'A topic folded into another''s route as a lesson, with every row the fold moved, so it can be unfolded.';

create or replace function fold_topic_into(p_topic uuid, p_into uuid)
returns uuid
language plpgsql
as $$
declare
  v_owner uuid;
  v_title text;
  v_summary text;
  v_into_title text;
  v_snapshot jsonb;
  v_curriculum uuid;
  v_made boolean := false;
  v_lesson uuid;
  v_position int;
  v_slug text;
  v_ledger jsonb;
  v_fold uuid;
begin
  if p_topic = p_into then
    raise exception 'fold_topic_into: cannot fold a topic into itself';
  end if;

  select user_id, title, summary, to_jsonb(t) into v_owner, v_title, v_summary, v_snapshot
  from topics t where id = p_topic;
  select title into v_into_title from topics where id = p_into;
  if v_owner is null or v_into_title is null then
    raise exception 'fold_topic_into: no such topic';
  end if;
  if topic_has_a_route(p_topic) then
    raise exception
      'fold_topic_into: "%" has a route through it. A topic carrying a curriculum cannot change level.',
      v_title;
  end if;

  -- What is about to move, recorded before it moves.
  v_ledger := jsonb_build_object(
    'child_links', coalesce((select jsonb_agg(jsonb_build_object('resource_id', resource_id, 'relevance', relevance))
      from resource_topics where topic_id = p_topic), '[]'::jsonb),
    'parent_relevance', coalesce((select jsonb_agg(jsonb_build_object('resource_id', p.resource_id, 'relevance', p.relevance))
      from resource_topics p join resource_topics c on c.resource_id = p.resource_id
      where p.topic_id = p_into and c.topic_id = p_topic), '[]'::jsonb),
    'exposures', coalesce((select jsonb_agg(id) from exposures where topic_id = p_topic), '[]'::jsonb),
    'conversations', coalesce((select jsonb_agg(id) from conversations where topic_id = p_topic), '[]'::jsonb),
    'highlights', coalesce((select jsonb_agg(id) from highlights where topic_id = p_topic), '[]'::jsonb),
    'cloze_concepts', coalesce((select jsonb_agg(id) from cloze_concepts where topic_id = p_topic), '[]'::jsonb),
    'clozes', coalesce((select jsonb_agg(id) from clozes where topic_id = p_topic), '[]'::jsonb),
    'tags', coalesce((select jsonb_agg(to_jsonb(h)) from highlight_tags h where topic_id = p_topic), '[]'::jsonb),
    'memberships', coalesce((select jsonb_agg(to_jsonb(m)) from topic_subjects m where topic_id = p_topic), '[]'::jsonb),
    'memberships_added', coalesce((select jsonb_agg(m.subject_id) from topic_subjects m
      where m.topic_id = p_topic
        and not exists (select 1 from topic_subjects k where k.topic_id = p_into and k.subject_id = m.subject_id)), '[]'::jsonb),
    'edges', coalesce((select jsonb_agg(to_jsonb(e)) from edges e where from_topic = p_topic or to_topic = p_topic), '[]'::jsonb),
    'lessons_elsewhere', coalesce((select jsonb_agg(id) from lessons where topic_id = p_topic), '[]'::jsonb)
  );

  select id into v_curriculum
  from curricula
  where topic_id = p_into
  order by case status when 'active' then 0 when 'draft' then 1 else 2 end, created_at
  limit 1;
  if v_curriculum is null then
    insert into curricula (user_id, topic_id, title, status, created_by)
    values (v_owner, p_into, v_into_title, 'draft', 'user')
    returning id into v_curriculum;
    v_made := true;
  end if;

  select coalesce(max(position), 0) + 1 into v_position from lessons where curriculum_id = v_curriculum;
  v_slug := regexp_replace(lower(v_title), '[^a-z0-9]+', '-', 'g') || '-' || substr(gen_random_uuid()::text, 1, 4);
  insert into lessons (user_id, curriculum_id, topic_id, title, slug, summary, position, created_by)
  values (v_owner, v_curriculum, p_into, v_title, v_slug, v_summary, v_position, 'user')
  returning id into v_lesson;

  -- The moves, as `demote_topic_into` makes them.
  update resource_topics rt_into
  set relevance = greatest(rt_into.relevance, rt_from.relevance)
  from resource_topics rt_from
  where rt_from.topic_id = p_topic and rt_into.topic_id = p_into and rt_from.resource_id = rt_into.resource_id;

  insert into lesson_resources (lesson_id, resource_id, relevance)
  select v_lesson, rt.resource_id, rt.relevance from resource_topics rt where rt.topic_id = p_topic
  on conflict do nothing;

  delete from resource_topics rt_from
  where rt_from.topic_id = p_topic
    and exists (select 1 from resource_topics rt_into where rt_into.topic_id = p_into and rt_into.resource_id = rt_from.resource_id);
  update resource_topics set topic_id = p_into where topic_id = p_topic;

  update exposures set topic_id = p_into where topic_id = p_topic;
  update conversations set topic_id = p_into where topic_id = p_topic;
  update highlights set topic_id = p_into where topic_id = p_topic;
  update cloze_concepts set topic_id = p_into where topic_id = p_topic;
  update clozes set topic_id = p_into where topic_id = p_topic;

  delete from highlight_tags t
  where t.topic_id = p_topic
    and exists (select 1 from highlight_tags k where k.highlight_id = t.highlight_id and k.topic_id = p_into);
  update highlight_tags set topic_id = p_into where topic_id = p_topic;

  insert into topic_subjects (topic_id, subject_id, created_by)
  select p_into, subject_id, created_by from topic_subjects where topic_id = p_topic
  on conflict do nothing;
  delete from topic_subjects where topic_id = p_topic;

  delete from edges
  where (from_topic = p_topic or to_topic = p_topic)
    and (case when from_topic = p_topic then p_into else from_topic end)
      = (case when to_topic = p_topic then p_into else to_topic end);
  delete from edges e
  where (e.from_topic = p_topic or e.to_topic = p_topic)
    and exists (
      select 1 from edges k
      where k.from_topic <> p_topic and k.to_topic <> p_topic and k.kind = e.kind
        and k.from_topic = (case when e.from_topic = p_topic then p_into else e.from_topic end)
        and k.to_topic = (case when e.to_topic = p_topic then p_into else e.to_topic end)
    );
  update edges
  set from_topic = case when from_topic = p_topic then p_into else from_topic end,
      to_topic = case when to_topic = p_topic then p_into else to_topic end
  where from_topic = p_topic or to_topic = p_topic;

  -- New with the fold: a lesson elsewhere that taught this topic now
  -- teaches the one it went into, rather than nothing.
  update lessons set topic_id = p_into where topic_id = p_topic and id <> v_lesson;

  delete from topics where id = p_topic;

  insert into topic_folds (user_id, topic_id, into_id, lesson_id, curriculum_id, made_curriculum, snapshot, ledger)
  values (v_owner, p_topic, p_into, v_lesson, v_curriculum, v_made, v_snapshot, v_ledger)
  returning id into v_fold;

  return v_fold;
end;
$$;

create or replace function unfold_topic(p_fold uuid)
returns uuid
language plpgsql
as $$
declare
  f topic_folds%rowtype;
  v_child uuid;
  v_parent uuid;
  v_edge jsonb;
  v_worked boolean;
begin
  select * into f from topic_folds where id = p_fold;
  if f.id is null then
    raise exception 'unfold_topic: no such fold';
  end if;
  if f.unfolded_at is not null then
    raise exception 'unfold_topic: this fold has already been undone';
  end if;
  v_child := f.topic_id;
  v_parent := f.into_id;
  if exists (select 1 from topics where id = v_child) then
    raise exception 'unfold_topic: the folded topic is already on the map';
  end if;

  -- The row, as it stood. The insert trigger files it under its home
  -- with none of what that membership carried -- its place in the bed,
  -- who made it -- so the trigger's rows are cleared and the memberships
  -- written exactly as they were.
  insert into topics select * from jsonb_populate_record(null::topics, f.snapshot);

  delete from topic_subjects where topic_id = v_child;
  insert into topic_subjects
  select * from jsonb_populate_recordset(null::topic_subjects, f.ledger->'memberships');
  delete from topic_subjects
  where topic_id = v_parent
    and subject_id in (select (s #>> '{}')::uuid from jsonb_array_elements(f.ledger->'memberships_added') s);

  -- Material: shared links get the folded topic's own link back and the
  -- relevance the fold raised put down; the rest move back.
  update resource_topics set topic_id = v_child
  where topic_id = v_parent
    and resource_id in (select (l->>'resource_id')::uuid from jsonb_array_elements(f.ledger->'child_links') l)
    and resource_id not in (select (p->>'resource_id')::uuid from jsonb_array_elements(f.ledger->'parent_relevance') p);
  insert into resource_topics (resource_id, topic_id, relevance)
  select (p->>'resource_id')::uuid, v_child, (c->>'relevance')::numeric
  from jsonb_array_elements(f.ledger->'parent_relevance') p
  join jsonb_array_elements(f.ledger->'child_links') c on c->>'resource_id' = p->>'resource_id'
  on conflict do nothing;
  update resource_topics rt set relevance = (p->>'relevance')::numeric
  from jsonb_array_elements(f.ledger->'parent_relevance') p
  where rt.topic_id = v_parent and rt.resource_id = (p->>'resource_id')::uuid;

  -- The reading log, and what was read since against the fold's lesson.
  update exposures set topic_id = v_child
  where topic_id = v_parent
    and (id in (select (e #>> '{}')::uuid from jsonb_array_elements(f.ledger->'exposures') e)
         or (source = 'lesson' and source_id = f.lesson_id));
  update conversations set topic_id = v_child
  where topic_id = v_parent and id in (select (e #>> '{}')::uuid from jsonb_array_elements(f.ledger->'conversations') e);
  update highlights set topic_id = v_child
  where topic_id = v_parent and id in (select (e #>> '{}')::uuid from jsonb_array_elements(f.ledger->'highlights') e);
  update cloze_concepts set topic_id = v_child
  where topic_id = v_parent and id in (select (e #>> '{}')::uuid from jsonb_array_elements(f.ledger->'cloze_concepts') e);
  update clozes set topic_id = v_child
  where topic_id = v_parent and id in (select (e #>> '{}')::uuid from jsonb_array_elements(f.ledger->'clozes') e);

  -- Tags: the re-pointed ones move back; the duplicates the fold
  -- dropped are written again.
  update highlight_tags set topic_id = v_child
  where topic_id = v_parent and id in (select (t->>'id')::uuid from jsonb_array_elements(f.ledger->'tags') t);
  insert into highlight_tags
  select * from jsonb_populate_recordset(null::highlight_tags, f.ledger->'tags')
  on conflict do nothing;

  -- Edges: back to the ends they had, or written again where the fold
  -- dropped them.
  for v_edge in select * from jsonb_array_elements(f.ledger->'edges') loop
    if exists (select 1 from edges where id = (v_edge->>'id')::uuid) then
      begin
        update edges
        set from_topic = (v_edge->>'from_topic')::uuid, to_topic = (v_edge->>'to_topic')::uuid
        where id = (v_edge->>'id')::uuid;
      exception when unique_violation then
        null;
      end;
    else
      insert into edges select * from jsonb_populate_record(null::edges, v_edge)
      on conflict do nothing;
    end if;
  end loop;

  update lessons set topic_id = v_child
  where topic_id = v_parent and id in (select (e #>> '{}')::uuid from jsonb_array_elements(f.ledger->'lessons_elsewhere') e);

  -- The lesson the fold made: dropped if nobody has worked it, kept and
  -- teaching the unfolded topic if they have.
  if f.lesson_id is not null then
    select completed_at is not null or body is not null
        or exists (select 1 from highlights where lesson_id = f.lesson_id)
        or exists (select 1 from clozes where lesson_id = f.lesson_id)
      into v_worked
    from lessons where id = f.lesson_id;
    if v_worked then
      update lessons set topic_id = v_child where id = f.lesson_id;
    else
      delete from lessons where id = f.lesson_id;
      if f.made_curriculum and f.curriculum_id is not null
         and not exists (select 1 from lessons where curriculum_id = f.curriculum_id) then
        delete from curricula where id = f.curriculum_id and status = 'draft';
      end if;
    end if;
  end if;

  update topic_folds set unfolded_at = now() where id = p_fold;
  return v_child;
end;
$$;

-- ------------------------------------------------------ promotions

create table if not exists subject_promotions (
  subject_id uuid primary key references subjects(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  topic_id uuid references topics(id) on delete set null,
  -- Each topic the promotion rehomed, and its home before.
  prior jsonb not null,
  created_at timestamptz not null default now()
);

alter table subject_promotions enable row level security;
drop policy if exists subject_promotions_owner on subject_promotions;
create policy subject_promotions_owner on subject_promotions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table subject_promotions is
  'A subject made by promoting a topic, with each rehomed topic''s home before, so the promotion can be put back.';

-- As in 044, and now recording each topic's home before it moves.
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

  insert into subject_promotions (subject_id, user_id, topic_id, prior)
  select v_subject, v_owner, p_topic,
    coalesce(jsonb_agg(jsonb_build_object('topic_id', t.id, 'primary_subject_id', t.primary_subject_id)), '[]'::jsonb)
  from topics t
  where exists (select 1 from topic_subjects ts where ts.topic_id = t.id and ts.subject_id = v_subject);

  update topics t
  set primary_subject_id = v_subject
  where exists (
    select 1 from topic_subjects ts
    where ts.topic_id = t.id and ts.subject_id = v_subject
  );

  return v_subject;
end;
$$;

create or replace function unpromote_subject(p_subject uuid)
returns uuid
language plpgsql
as $$
declare
  p subject_promotions%rowtype;
begin
  select * into p from subject_promotions where subject_id = p_subject;
  if p.subject_id is null then
    raise exception 'unpromote_subject: this subject was not made by promoting a topic';
  end if;

  -- Each topic's home as it was, where it is still this subject. A home
  -- the reader has moved since is theirs, and stays.
  update topics t
  set primary_subject_id = (r->>'primary_subject_id')::uuid
  from jsonb_array_elements(p.prior) r
  where t.id = (r->>'topic_id')::uuid and t.primary_subject_id = p_subject;

  -- Anything homed here since the promotion has no home to go back to.
  update topics set primary_subject_id = null where primary_subject_id = p_subject;

  delete from subjects where id = p_subject;
  return p.topic_id;
end;
$$;
