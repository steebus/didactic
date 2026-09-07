create type resource_kind as enum ('article', 'pdf', 'book', 'note');
create type resource_status as enum ('queued', 'reading', 'consumed', 'abandoned');

create table resources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  url text,
  title text not null,
  kind resource_kind not null,
  status resource_status not null default 'queued',
  raw_text text,
  summary text,
  storage_path text,
  mime_type text,
  file_size bigint,
  added_at timestamptz not null default now(),
  consumed_at timestamptz
);

create table resource_nodes (
  resource_id uuid not null references resources(id) on delete cascade,
  node_id uuid not null references nodes(id) on delete cascade,
  relevance numeric(3,2) not null,
  primary key (resource_id, node_id)
);
