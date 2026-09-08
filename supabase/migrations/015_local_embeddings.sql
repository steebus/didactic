-- Move from OpenAI's 1536-dimension embeddings to gte-small's 384,
-- which the Supabase edge runtime ships and runs with no API key.
--
-- Existing vectors cannot be converted between models, so they are
-- dropped: an embedding is a cache of the title, regenerable at any
-- time. Topics keep their identity, history, and figures; only the
-- resolution vector is rebuilt.

drop index if exists topics_embedding_idx;

alter table topics drop column embedding;
alter table topics add column embedding vector(384);

create index topics_embedding_idx on topics
  using hnsw (embedding vector_cosine_ops);

drop function if exists match_topics(vector, int);

create or replace function match_topics(
  query_embedding vector(384),
  match_count int default 10
)
returns table (id uuid, title text, embedding vector(384))
language sql stable
as $$
  select id, title, embedding
  from topics
  where state = 'active' and embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;
