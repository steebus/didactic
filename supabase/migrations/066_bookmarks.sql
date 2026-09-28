-- 066: where the reader stopped, one place per lesson or resource.
--
-- A bookmark is dropped by hand, from the reading's own buttons, and
-- there is only ever one per reading: dropping another moves it, and
-- pressing the button again takes it away. So the row is keyed on the
-- reader and the reading, and a write is an upsert.
--
-- Kept as words, not as a position (`core/bookmarks`): the words at the
-- spot and a little of what came before them, which survive a lesson
-- being rewritten, and how far down the reading it was, to fall back on
-- when they do not.
--
-- Its own table rather than another kind of mark. A mark is counted --
-- on the Marked sheet, in the topic's figure, in the day's activity --
-- and every one of those would have to learn to leave a bookmark out.
--
-- Idempotent, like everything since 025.

create table if not exists bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid references lessons(id) on delete cascade,
  resource_id uuid references resources(id) on delete cascade,
  words text not null,
  prefix text not null default '',
  at real not null default 0,
  updated_at timestamptz not null default now()
);

-- Exactly one reading. Nulls are distinct under a unique constraint, so
-- the two below each hold for the rows they are about and ignore the
-- rest.
alter table bookmarks drop constraint if exists bookmarks_one_reading;
alter table bookmarks add constraint bookmarks_one_reading
  check (num_nonnulls(lesson_id, resource_id) = 1);

alter table bookmarks drop constraint if exists bookmarks_one_per_lesson;
alter table bookmarks add constraint bookmarks_one_per_lesson unique (user_id, lesson_id);

alter table bookmarks drop constraint if exists bookmarks_one_per_resource;
alter table bookmarks add constraint bookmarks_one_per_resource unique (user_id, resource_id);

alter table bookmarks drop constraint if exists bookmarks_at_is_a_fraction;
alter table bookmarks add constraint bookmarks_at_is_a_fraction check (at >= 0 and at <= 1);

alter table bookmarks enable row level security;
drop policy if exists bookmarks_owner on bookmarks;
create policy bookmarks_owner on bookmarks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table bookmarks is
  'Where the reader stopped in a lesson or a resource: one per reading, dropped by hand.';
comment on column bookmarks.words is
  'The words starting at the spot, as the page printed them (core/bookmarks.placeAt).';
comment on column bookmarks.prefix is
  'The words just before the spot, to tell a repeated run of words apart.';
comment on column bookmarks.at is
  'How far down the reading the spot was, from 0 to 1: the fallback when the words are gone.';
