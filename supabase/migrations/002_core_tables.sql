create type node_state as enum ('active', 'pending');
create type created_by_kind as enum ('ai', 'user', 'skeleton');
create type edge_kind as enum ('prereq', 'related', 'specialises', 'alternative');

create table clusters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  title text not null,
  colour text not null,
  created_at timestamptz not null default now()
);

create table nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  title text not null,
  slug text not null,
  summary text,
  embedding vector(1536),
  cluster_id uuid references clusters(id) on delete set null,
  ability numeric(2,1) not null default 1.0,
  ability_confidence numeric(3,2) not null default 0.0,
  last_exposure_at timestamptz,
  state node_state not null default 'active',
  created_by created_by_kind not null,
  created_at timestamptz not null default now(),
  unique (user_id, slug)
);

create index nodes_embedding_idx on nodes
  using hnsw (embedding vector_cosine_ops);
create index nodes_cluster_idx on nodes (cluster_id);

create table edges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  from_node uuid not null references nodes(id) on delete cascade,
  to_node uuid not null references nodes(id) on delete cascade,
  kind edge_kind not null,
  weight numeric(3,2) not null default 0.5,
  created_by created_by_kind not null,
  unique (from_node, to_node, kind)
);
