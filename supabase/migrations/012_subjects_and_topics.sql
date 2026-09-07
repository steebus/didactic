-- The vocabulary the product actually uses: Subject > Topic > Curriculum
-- > Lesson. "cluster" and "node" were graph words that had leaked into
-- the domain, and badly: the home screen printed a node as a "subject"
-- while a cluster printed as a "section". This renames them to what they
-- are and makes one real structural change -- a topic may belong to more
-- than one subject.
--
-- Renames only. No data moves, no ids change.

alter table clusters rename to subjects;
alter table nodes rename to topics;
alter type node_state rename to topic_state;

alter table topics rename column cluster_id to primary_subject_id;
alter index nodes_cluster_idx rename to topics_primary_subject_idx;
alter index nodes_embedding_idx rename to topics_embedding_idx;

alter table edges rename column from_node to from_topic;
alter table edges rename column to_node to to_topic;

alter table exposures rename column node_id to topic_id;
alter index exposures_node_idx rename to exposures_topic_idx;

alter table conversations rename column node_id to topic_id;

alter table resource_nodes rename to resource_topics;
alter table resource_topics rename column node_id to topic_id;

-- Exposure is needed by portrait photography and by landscape
-- photography, and JavaScript is needed by front-end and by app
-- development. A single owning subject could not say that, so
-- membership becomes many-to-many. `primary_subject_id` survives as the
-- topic's home -- it is what the graph colours by, and what a topic
-- falls back to when it belongs to nothing else.
create table topic_subjects (
  topic_id uuid not null references topics(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  created_by created_by_kind not null default 'ai',
  created_at timestamptz not null default now(),
  primary key (topic_id, subject_id)
);

create index topic_subjects_subject_idx on topic_subjects (subject_id);

-- Every topic that had a cluster keeps that membership.
insert into topic_subjects (topic_id, subject_id, created_by)
select id, primary_subject_id, created_by
from topics
where primary_subject_id is not null;

-- Keep the home subject inside the membership set. Without this a
-- reassignment could leave a topic filed nowhere while still claiming a
-- home, which is exactly the inconsistency the join table exists to
-- avoid.
create or replace function sync_primary_subject_membership()
returns trigger
language plpgsql
as $$
begin
  if new.primary_subject_id is not null then
    insert into topic_subjects (topic_id, subject_id, created_by)
    values (new.id, new.primary_subject_id, new.created_by)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger topics_primary_subject_membership
after insert or update of primary_subject_id on topics
for each row execute function sync_primary_subject_membership();

-- The three RPCs are renamed with their tables. PostgREST calls them by
-- name, so the old names go rather than lingering as dead aliases.
drop function if exists match_nodes(vector, int);

create or replace function match_topics(
  query_embedding vector(1536),
  match_count int default 10
)
returns table (id uuid, title text, embedding vector(1536))
language sql stable
as $$
  select id, title, embedding
  from topics
  where state = 'active' and embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;

drop function if exists commit_ingestion(uuid, uuid, text, jsonb, jsonb);

create or replace function commit_ingestion(
  p_resource_id uuid,
  p_user_id uuid,
  p_summary text,
  p_new_topics jsonb,     -- [{title, slug, summary, embedding, state, relevance}]
  p_links jsonb           -- [{topic_id, relevance}]
)
returns table (out_id uuid, out_title text)
language plpgsql
as $$
declare
  t jsonb;
  new_id uuid;
begin
  update resources set summary = p_summary where resources.id = p_resource_id;

  for t in select * from jsonb_array_elements(p_new_topics) loop
    insert into topics (user_id, title, slug, summary, embedding, state, created_by)
    values (
      p_user_id,
      t->>'title',
      -- Slugs are unique per user; suffix collisions rather than failing
      -- the whole ingestion for one duplicate name.
      (t->>'slug') || '-' || substr(gen_random_uuid()::text, 1, 4),
      t->>'summary',
      (t->>'embedding')::vector,
      (t->>'state')::topic_state,
      'ai'
    )
    returning topics.id into new_id;

    insert into resource_topics (resource_id, topic_id, relevance)
    values (p_resource_id, new_id, (t->>'relevance')::numeric);

    out_id := new_id;
    out_title := t->>'title';
    return next;
  end loop;

  insert into resource_topics (resource_id, topic_id, relevance)
  select p_resource_id, (l->>'topic_id')::uuid, (l->>'relevance')::numeric
  from jsonb_array_elements(p_links) l
  on conflict do nothing;
end;
$$;

drop function if exists merge_nodes(uuid, uuid);

-- Merge a duplicate topic into a canonical one, in one transaction.
--
-- resource_topics has a composite primary key, so a resource linked to
-- BOTH topics would collide on a naive update. Those rows keep the
-- higher relevance and the duplicate's row is dropped. topic_subjects
-- has the same problem where both topics sit in one subject.
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
