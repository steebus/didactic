create or replace function match_nodes(
  query_embedding vector(1536),
  match_count int default 10
)
returns table (id uuid, title text, embedding vector(1536))
language sql stable
as $$
  select id, title, embedding
  from nodes
  where state = 'active' and embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;
