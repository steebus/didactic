-- Adjudication asks whether two topics cover the same ground, and the
-- inbox could only show two titles while asking it. The summary is
-- what actually answers the question -- "Common vs Preferred Stock"
-- and "Equity Ownership Fundamentals" are indistinguishable as names
-- and obviously different as descriptions -- so the nearest-match
-- lookup returns it too.
drop function if exists match_topics(vector, int);

create or replace function match_topics(
  query_embedding vector(384),
  match_count int default 10
)
returns table (id uuid, title text, summary text, embedding vector(384))
language sql stable
as $$
  select id, title, summary, embedding
  from topics
  where state = 'active' and embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;
