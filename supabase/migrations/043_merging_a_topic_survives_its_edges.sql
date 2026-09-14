-- Saying two topics are the same thing failed on the constraint that
-- keeps the graph from drawing one connection twice.
--
--     duplicate key value violates unique constraint
--     "edges_from_node_to_node_kind_key"
--
-- (The name is the one the column pair carried before `012` renamed
-- node to topic; Postgres keeps a constraint's name through a rename.)
--
-- The cause is an ordering, not a missing rule. `merge_topics` moved
-- every edge onto the survivor and *then* cleared up the duplicates the
-- move had created -- but the constraint is checked per statement, so
-- the move itself is where it fails. Two topics that both lead to a
-- third is not an edge case: it is the ordinary shape of a duplicate,
-- and it is precisely why the two are being merged. So the adjudication
-- queue could offer a merge that could not be performed, and a reader
-- pressing "same as" got a Postgres error with the old column names in
-- it.
--
-- The clearing up now happens first: an edge on the duplicate that
-- would land on one the survivor already holds is dropped *before*
-- anything moves, leaving the survivor the stronger of the two weights,
-- and the move that follows can only ever be the edges that have
-- nowhere to collide.
--
-- Three other tables have grown a `topic_id` since `014` last touched
-- this function, and none of them was being moved. `highlights` and
-- both cloze tables are `on delete set null`, so a merge quietly cut
-- every marked passage and every card loose from the topic it was
-- about; `highlight_tags` is `on delete cascade`, so a merge *deleted*
-- the tags naming the duplicate. Merging is meant to join two histories
-- into one, and the least replaceable parts of that history were the
-- parts being dropped.
--
-- Safe to run twice: `create or replace`, and every statement in it is
-- a no-op once the duplicate is gone.

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

  -- What was marked while reading it, and what is being tended from it.
  -- All three are `set null` on delete, so without this the merge left
  -- the passages and the cards filed under nothing.
  update highlights set topic_id = p_into where topic_id = p_from;
  update cloze_concepts set topic_id = p_into where topic_id = p_from;
  update clozes set topic_id = p_into where topic_id = p_from;

  -- A note that named both topics named one thing twice, which is one
  -- tag: the partial unique index says so, and the duplicate's row is
  -- dropped rather than moved onto it.
  delete from highlight_tags t
  where t.topic_id = p_from
    and exists (
      select 1 from highlight_tags k
      where k.highlight_id = t.highlight_id and k.topic_id = p_into
    );

  update highlight_tags set topic_id = p_into where topic_id = p_from;

  -- The survivor inherits every subject the duplicate was filed under.
  insert into topic_subjects (topic_id, subject_id, created_by)
  select p_into, subject_id, created_by from topic_subjects where topic_id = p_from
  on conflict do nothing;
  delete from topic_subjects where topic_id = p_from;

  -- Edges, cleared before they move rather than after.
  --
  -- An edge is identified by (from, to, kind), so re-pointing one end
  -- at the survivor can land it exactly where an edge already stands.
  -- Both of those are dropped here, in the order that matters: the
  -- loops first, so that the duplicate check below never has to reason
  -- about an edge that is on its way to becoming one.

  -- Anything that would fold into a loop on the survivor: the edge
  -- between the two topics themselves, and any edge whose other end is
  -- already the survivor.
  delete from edges
  where (from_topic = p_from or to_topic = p_from)
    and (case when from_topic = p_from then p_into else from_topic end)
      = (case when to_topic = p_from then p_into else to_topic end);

  -- The survivor keeps the stronger of the two weights, so merging a
  -- duplicate cannot weaken a connection the map already drew.
  update edges k
  set weight = greatest(k.weight, e.weight)
  from edges e
  where (e.from_topic = p_from or e.to_topic = p_from)
    and k.from_topic <> p_from
    and k.to_topic <> p_from
    and k.kind = e.kind
    and k.from_topic = (case when e.from_topic = p_from then p_into else e.from_topic end)
    and k.to_topic = (case when e.to_topic = p_from then p_into else e.to_topic end);

  -- Then the duplicate's own copy goes. The survivor's edge is matched
  -- among the edges that are *not* moving, so two edges that would
  -- collide with each other can never both be deleted here.
  delete from edges e
  where (e.from_topic = p_from or e.to_topic = p_from)
    and exists (
      select 1 from edges k
      where k.from_topic <> p_from
        and k.to_topic <> p_from
        and k.kind = e.kind
        and k.from_topic = (case when e.from_topic = p_from then p_into else e.from_topic end)
        and k.to_topic = (case when e.to_topic = p_from then p_into else e.to_topic end)
    );

  -- What is left has nowhere to collide, and both ends move in one
  -- statement so no half-moved edge is ever checked against the
  -- constraint.
  update edges
  set from_topic = case when from_topic = p_from then p_into else from_topic end,
      to_topic = case when to_topic = p_from then p_into else to_topic end
  where from_topic = p_from or to_topic = p_from;

  delete from topics where id = p_from;
end;
$$;
