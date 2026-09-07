create type job_state as enum ('pending', 'running', 'failed', 'done');

create table ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references resources(id) on delete cascade,
  state job_state not null default 'pending',
  attempts int not null default 0,
  error text,
  updated_at timestamptz not null default now()
);

select pgmq.create('ingestion');
