create type conversation_kind as enum ('refresher', 'exposure_debrief', 'quiz');
create type message_role as enum ('user', 'assistant', 'system');

create table conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  kind conversation_kind not null,
  node_id uuid references nodes(id) on delete cascade,
  started_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role message_role not null,
  content text not null,
  token_count int,
  created_at timestamptz not null default now()
);

create index messages_conversation_idx on messages (conversation_id, created_at);
