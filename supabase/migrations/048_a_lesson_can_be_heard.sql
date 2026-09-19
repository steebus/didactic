-- A lesson can be listened to.
--
-- Reading is not the only way through a lesson, and it is the wrong way
-- on a walk. The body is already written and already prose, so what is
-- missing is a voice and somewhere to keep what it said.
--
-- Two tables rather than one, because the wait is the whole design.
-- Synthesis on the machine that does it runs at about 1.28x realtime:
-- faster than listening, but a twelve-minute lesson is still eight
-- minutes of work, and nobody presses Listen and waits eight minutes.
-- So the lesson is cut into chunks, each is voiced in order, and the
-- player starts on the first while the rest are still being made --
-- generation outruns playback, so it stays ahead. A chunk is a row and
-- a file; the voicing is the run that produces them.
--
-- Where the work happens is the other reason the shape is this. The
-- machine that runs the model has no inbound route -- it can reach out
-- and nothing can reach in -- so nothing calls it. It polls this table,
-- claims a row, and pushes what it made to storage. That is why there
-- is a `claimed_at` and a `heartbeat_at` here and no webhook anywhere:
-- the queue is the table, and the worker is a client of it like any
-- other. It also means this works identically against a laptop on
-- localhost and against the deployed web, since neither ever talks to
-- the machine.
--
-- Safe to run twice: `if not exists` throughout, policies dropped
-- before they are created, and the bucket upserted. Supabase applies
-- this on the push to main.

-- What became of one attempt to voice a lesson.
--
-- `failed` is kept rather than deleted so the reader can be told why,
-- and so a lesson that fails every time is visible as such instead of
-- looking like one nobody has asked for.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'lesson_audio_state') then
    create type lesson_audio_state as enum ('queued', 'voicing', 'ready', 'failed');
  end if;
end $$;

create table if not exists lesson_audio (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,
  state lesson_audio_state not null default 'queued',

  -- Which voice said it, so a lesson voiced in one and then another is
  -- two rows and not a contradiction.
  voice text not null default 'alba',

  -- How many chunks the lesson was cut into. Null until the worker has
  -- read the body and decided -- the count comes from the splitter, so
  -- nothing else can know it in advance. The player needs it to tell
  -- "still coming" from "that was the end".
  chunks int,

  -- What to say, in order: the splitter's output, as `[{index, text}]`.
  --
  -- Written when the row is queued rather than worked out by the worker
  -- on the other end, because the rule for what a lesson sounds like --
  -- which fences are silent, where a chunk may be cut, how short is too
  -- short -- is real logic with real tests, and a worker that split the
  -- body itself would be that rule written a second time in another
  -- language. The two would agree until the day a block was added. So
  -- the app decides what is said and the worker only says it.
  script jsonb,

  -- The body this was made from, as it stood. A lesson can be written
  -- again -- `regenerate` on the body route -- and audio made from the
  -- old prose is then a recording of a lesson that no longer exists.
  -- Compared rather than trusted: the app re-voices when it differs.
  body_hash text not null,

  -- Claimed by a worker at this moment. Null means nobody has it.
  -- Paired with `heartbeat_at` so a worker that dies mid-lesson does
  -- not hold the row forever: anything claimed whose heartbeat has gone
  -- quiet is free to take again.
  claimed_at timestamptz,
  heartbeat_at timestamptz,

  reason text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- One voicing per lesson per voice per version of the body. This is
-- what makes "press Listen twice" cheap: the second press finds the
-- row the first one made instead of queueing a second run of the same
-- eight minutes. The app upserts on it.
create unique index if not exists lesson_audio_once_idx
  on lesson_audio (lesson_id, voice, body_hash);

-- What the worker asks for, every poll: the oldest thing nobody holds.
-- Partial, because the queue is the short tail of the table and the
-- ready rows are the long body of it.
create index if not exists lesson_audio_queue_idx
  on lesson_audio (created_at)
  where state in ('queued', 'voicing');

create index if not exists lesson_audio_lesson_idx on lesson_audio (lesson_id);

comment on column lesson_audio.body_hash is
  'Hash of the lesson body this was voiced from. Audio whose hash no longer matches the lesson is stale and is re-voiced rather than played.';

-- A piece of a lesson, said.
--
-- Its own row so it can appear the moment it exists: the player polls
-- these and starts on the first while the rest are still being made.
-- Without this the reader waits for the whole lesson, which is the
-- thing this design is built to avoid.
--
-- The text is kept alongside the file, which is what makes the player
-- able to show the words being spoken and the lesson able to be checked
-- afterwards without re-reading the audio.
create table if not exists lesson_audio_chunks (
  audio_id uuid not null references lesson_audio(id) on delete cascade,
  idx int not null,
  -- Where the file sits in the `lesson-audio` bucket. Relative, so the
  -- bucket can be read through a signed URL without the path having
  -- been written with one baked in.
  path text not null,
  -- How long it plays, in seconds. Known once it is made, and summed to
  -- give the lesson its length without opening a single file.
  seconds real not null,
  -- What was said. The splitter's output, kept.
  text text not null,
  created_at timestamptz not null default now(),
  primary key (audio_id, idx)
);

comment on table lesson_audio_chunks is
  'One spoken piece of a lesson. Rows appear as they are made, in order, so playback can start before the lesson is finished.';

-- Both tables are the reader's own, read the way `038` reads every
-- other: the call wrapped so the planner runs it once.
alter table lesson_audio enable row level security;

drop policy if exists lesson_audio_owner on lesson_audio;
create policy lesson_audio_owner on lesson_audio
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table lesson_audio_chunks enable row level security;

-- Through the voicing, which is where the owner is written. A chunk has
-- no user of its own because it cannot outlive the run that made it.
drop policy if exists lesson_audio_chunks_owner on lesson_audio_chunks;
create policy lesson_audio_chunks_owner on lesson_audio_chunks
  for all using (
    exists (
      select 1 from lesson_audio a
      where a.id = lesson_audio_chunks.audio_id
        and a.user_id = (select auth.uid())
    )
  ) with check (
    exists (
      select 1 from lesson_audio a
      where a.id = lesson_audio_chunks.audio_id
        and a.user_id = (select auth.uid())
    )
  );

-- Where the audio lives.
--
-- Private, like `resources`: these are read through signed URLs, so the
-- files are not public even though nothing in them is secret. The app
-- already signs storage URLs this way and the player asks for one the
-- same as everything else does.
insert into storage.buckets (id, name, public)
values ('lesson-audio', 'lesson-audio', false)
on conflict (id) do nothing;

-- The owner reaches their own files, by the folder they are filed
-- under: `<user id>/<lesson id>/<n>.mp3`. The worker writes with the
-- service role and bypasses this entirely; the policy is for the phone
-- and for anything else that reads as the reader.
drop policy if exists lesson_audio_read_own on storage.objects;
create policy lesson_audio_read_own on storage.objects
  for select using (
    bucket_id = 'lesson-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
