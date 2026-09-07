create type exposure_source as enum ('resource', 'quiz', 'agent', 'manual');
create type exposure_depth as enum ('skim', 'read', 'applied');

create table exposures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  node_id uuid not null references nodes(id) on delete cascade,
  source exposure_source not null,
  source_id uuid,
  depth exposure_depth not null,
  ability_delta numeric(3,2) not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index exposures_node_idx on exposures (node_id, created_at desc);
