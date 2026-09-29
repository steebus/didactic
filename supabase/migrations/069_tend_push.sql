-- 069: Tend the Garden, on the phone.
--
-- The notice in the corner of the catalogue only speaks while a tab is
-- open. A push subscription is how the installed app asks when it is
-- not: one row per phone (or browser) that has said yes, with the time
-- of day the reader chose and the time zone it is in. It is reminded
-- once a day at that time, when something is due (`core/tendPush`).
--
-- The rounds are run from here, every quarter hour, by pg_cron through
-- pg_net: the app's plan allows its own cron once a day, at one time for
-- everybody, and the database already runs the ingestion worker the
-- same way (010).
-- The address to call is written by the app the first time a phone
-- subscribes (it is the address the phone subscribed through), and the
-- key the call carries is made here, in the database, so neither sits in
-- a setting somebody has to remember or in this repository. Until a
-- phone subscribes, the job does nothing.
--
-- Idempotent, like everything since 025.

create extension if not exists pg_net;

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  time_zone text not null default 'UTC',
  remind_at text not null default '08:00',
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);

alter table push_subscriptions drop constraint if exists push_subscriptions_remind_at_is_a_time;
alter table push_subscriptions add constraint push_subscriptions_remind_at_is_a_time
  check (remind_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;
drop policy if exists push_subscriptions_owner on push_subscriptions;
create policy push_subscriptions_owner on push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- One row. No policy: only the service role reads it, and the key in it
-- is the whole of the round's credential.
create table if not exists push_rounds (
  id boolean primary key default true check (id),
  origin text,
  key text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
insert into push_rounds (id) values (true) on conflict (id) do nothing;
alter table push_rounds enable row level security;

create or replace function run_tend_push()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  round push_rounds%rowtype;
begin
  select * into round from push_rounds where id;
  if round.origin is null then
    return;
  end if;

  perform net.http_post(
    url := round.origin || '/api/internal/tend-push',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'x-internal-key', round.key,
      'content-type', 'application/json'
    )
  );
end;
$$;

revoke all on function run_tend_push() from public, anon, authenticated;

-- Every quarter hour, so a reminder lands within fifteen minutes of the
-- time chosen for it.
select cron.unschedule(jobid) from cron.job where jobname = 'tend-push';
select cron.schedule('tend-push', '*/15 * * * *', 'select run_tend_push()');

comment on table push_subscriptions is
  'A phone or browser that has said yes to Tend reminders: its Web Push endpoint and keys, its time zone, and the time of day it is reminded at.';
comment on column push_subscriptions.remind_at is
  'The local time of day, HH:MM, the phone is reminded at: once a day, when something is due.';
comment on table push_rounds is
  'Where the quarter-hourly reminder round calls, and the key it carries. Written by the app; read by run_tend_push().';
