-- Merge a duplicate node into a canonical one, in one transaction.
--
-- resource_nodes has a composite primary key, so a resource linked to
-- BOTH nodes would collide on a naive update. Those rows keep the
-- higher relevance and the duplicate's row is dropped.

create or replace function merge_nodes(p_from uuid, p_into uuid)
returns void
language plpgsql
as $$
begin
  if p_from = p_into then
    raise exception 'merge_nodes: cannot merge a node into itself';
  end if;

  -- Keep the stronger link where both nodes share a resource.
  update resource_nodes rn_into
  set relevance = greatest(rn_into.relevance, rn_from.relevance)
  from resource_nodes rn_from
  where rn_from.node_id = p_from
    and rn_into.node_id = p_into
    and rn_from.resource_id = rn_into.resource_id;

  delete from resource_nodes rn_from
  where rn_from.node_id = p_from
    and exists (
      select 1 from resource_nodes rn_into
      where rn_into.node_id = p_into
        and rn_into.resource_id = rn_from.resource_id
    );

  update resource_nodes set node_id = p_into where node_id = p_from;
  update exposures set node_id = p_into where node_id = p_from;

  -- Edges: re-point, then drop self-edges and duplicates the move created.
  update edges set from_node = p_into where from_node = p_from;
  update edges set to_node = p_into where to_node = p_from;
  delete from edges where from_node = to_node;

  delete from edges e
  where e.id not in (
    select min(e2.id::text)::uuid
    from edges e2
    group by e2.from_node, e2.to_node, e2.kind
  );

  delete from nodes where id = p_from;
end;
$$;
