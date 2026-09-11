-- A document, read once and kept as passages.
--
-- A PDF has been filable since 003 and readable since the ingester
-- learned to open one, but only as a single slab of `raw_text` on the
-- resource row: enough to pull concepts out of, useless for anything
-- that has to point back into it. A lesson that cites a book has to be
-- able to say which page, and a reader who presses that citation has to
-- be given the words -- neither is possible from a slab.
--
-- So the document is cut into passages on the way in. A passage is the
-- unit that gets an embedding, the unit retrieval returns, the unit a
-- citation names, and the unit the reader is shown. The cutting is
-- `packages/core/src/passages.ts`, where it can be tested without a
-- database; this is only where the pieces land.
--
-- Idempotent throughout: Supabase applies these on the push to main, so
-- a migration that half-applies is a database nobody has looked at.

create table if not exists resource_passages (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references resources(id) on delete cascade,
  -- Carried rather than reached for through the resource. Every policy
  -- and every query here filters on the owner, and a join per passage
  -- on a table with a few hundred thousand rows in it is a join too
  -- many. It is the same shape `lessons` and `curricula` already use.
  user_id uuid not null references auth.users(id),
  -- Order within the document. Also the resume point: a round that
  -- stops half way numbers on from the last one it wrote.
  ordinal int not null,
  -- What a citation prints, one-based, as the reader would count it.
  page_from int not null,
  page_to int not null,
  -- The chapter or section it fell under, where the outline knew. Null
  -- is ordinary -- front matter, appendices, a document whose structure
  -- could not be read at all.
  heading text,
  content text not null,
  -- gte-small, the same 384 the rest of the map is embedded in (015).
  -- Null until the round that wrote the passage gets to embedding it,
  -- which is a separate pass because it is a separate failure.
  embedding vector(384),
  created_at timestamptz not null default now(),
  unique (resource_id, ordinal)
);

create index if not exists resource_passages_resource_idx
  on resource_passages (resource_id, ordinal);

-- What retrieval actually rides on. hnsw with cosine, matching
-- topics_embedding_idx: the same model, so the same distance.
create index if not exists resource_passages_embedding_idx
  on resource_passages using hnsw (embedding vector_cosine_ops);

-- Passages still waiting for a vector. Read once per round to find the
-- work; partial, so it stays small as the document finishes.
create index if not exists resource_passages_unembedded_idx
  on resource_passages (resource_id)
  where embedding is null;

alter table resource_passages enable row level security;
drop policy if exists resource_passages_owner on resource_passages;
create policy resource_passages_owner on resource_passages for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The nearest passages to a question, within a named set of documents.
--
-- The set is passed rather than inferred because the caller knows what
-- it is allowed to cite and this function should not have to work it
-- out: a lesson may cite its curriculum's sources and its subject's,
-- and nothing else. An empty set returns nothing, which is the right
-- answer for a lesson with no sources rather than an error.
--
-- `stable`, `sql`, and no writes, exactly like match_topics.
create or replace function match_passages(
  p_resource_ids uuid[],
  query_embedding vector(384),
  match_count int default 6
)
returns table (
  id uuid,
  resource_id uuid,
  page_from int,
  page_to int,
  heading text,
  content text,
  similarity real
)
language sql stable
as $$
  select
    p.id,
    p.resource_id,
    p.page_from,
    p.page_to,
    p.heading,
    p.content,
    (1 - (p.embedding <=> query_embedding))::real as similarity
  from resource_passages p
  where p.resource_id = any(p_resource_ids)
    and p.embedding is not null
  order by p.embedding <=> query_embedding
  limit match_count;
$$;

comment on table resource_passages is
  'A document cut into citable pieces. Written in rounds; see ingestion_jobs.pages_done.';
comment on column resource_passages.page_from is
  'One-based page the passage starts on. This is what a citation prints.';
