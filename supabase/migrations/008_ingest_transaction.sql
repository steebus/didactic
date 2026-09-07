drop function if exists commit_ingestion(uuid, uuid, text, jsonb, jsonb);

create or replace function commit_ingestion(
  p_resource_id uuid,
  p_user_id uuid,
  p_summary text,
  p_new_nodes jsonb,      -- [{title, slug, summary, embedding, state, relevance}]
  p_links jsonb           -- [{node_id, relevance}]
)
returns table (out_id uuid, out_title text)
language plpgsql
as $$
declare
  n jsonb;
  new_id uuid;
begin
  update resources set summary = p_summary where resources.id = p_resource_id;

  for n in select * from jsonb_array_elements(p_new_nodes) loop
    insert into nodes (user_id, title, slug, summary, embedding, state, created_by)
    values (
      p_user_id,
      n->>'title',
      -- Slugs are unique per user; suffix collisions rather than failing
      -- the whole ingestion for one duplicate name.
      (n->>'slug') || '-' || substr(gen_random_uuid()::text, 1, 4),
      n->>'summary',
      (n->>'embedding')::vector,
      (n->>'state')::node_state,
      'ai'
    )
    returning nodes.id into new_id;

    insert into resource_nodes (resource_id, node_id, relevance)
    values (p_resource_id, new_id, (n->>'relevance')::numeric);

    out_id := new_id;
    out_title := n->>'title';
    return next;
  end loop;

  insert into resource_nodes (resource_id, node_id, relevance)
  select p_resource_id, (l->>'node_id')::uuid, (l->>'relevance')::numeric
  from jsonb_array_elements(p_links) l
  on conflict do nothing;
end;
$$;
