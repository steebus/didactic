-- Row level security, because the phone reads rows directly.
--
-- Until now the gate was the app: every read went through the API on the
-- service role, which bypasses RLS, and the only thing standing between
-- a stranger and the catalogue was `src/lib/auth.ts`. That was defensible
-- while the web was the only client. It stops being defensible the moment
-- the phone holds the owner's token and talks to PostgREST and Realtime
-- itself, where there is no route handler to check anything.
--
-- So ownership moves into the database. The API is unaffected -- the
-- service role still bypasses all of this -- and what changes is that a
-- token now buys exactly the rows it owns and nothing else.
--
-- The tables are enumerated from the live schema rather than from memory:
-- 012 renamed clusters->subjects, nodes->topics and resource_nodes->
-- resource_topics, and 023 added resource_subjects after the plan was
-- written. A policy naming a table that does not exist fails loudly; a
-- table nobody remembered stays silently readable by anyone. The second
-- is the one worth being careful about.
--
-- To revert:
--   drop policy <name> on <table>;              -- each policy below
--   alter table <table> disable row level security;
--   alter publication supabase_realtime drop table resources, topics;
-- `highlights` keeps its own policy from 020 either way.

-- 1. The nine tables that carry the owner's id.
--
-- `highlights` is deliberately absent: 020 already enables RLS and
-- creates highlights_owner with exactly this shape. Repeating it here
-- would fail on the duplicate name.
do $$
declare
  owned text;
begin
  foreach owned in array array[
    'subjects', 'topics', 'edges', 'resources', 'exposures',
    'conversations', 'curricula', 'lessons', 'subject_sowings'
  ]
  loop
    execute format('alter table %I enable row level security', owned);
    execute format(
      'create policy %I on %I for all using (auth.uid() = user_id) '
      'with check (auth.uid() = user_id)',
      owned || '_owner', owned
    );
  end loop;
end
$$;

-- 2. The join and child tables, which own nothing themselves.
--
-- Each reaches its parent for an answer. `using` and `with check` are
-- both given: without the check half a token could write a row joining
-- its own record to somebody else's.
--
-- `lesson_prereqs` keys on lesson_id rather than requires_lesson_id --
-- it has two foreign keys into lessons, and the row belongs to the
-- lesson that has the prerequisite, not the one that is one.

alter table topic_subjects enable row level security;
create policy topic_subjects_owner on topic_subjects for all
  using (exists (select 1 from topics t where t.id = topic_id and t.user_id = auth.uid()))
  with check (exists (select 1 from topics t where t.id = topic_id and t.user_id = auth.uid()));

alter table resource_topics enable row level security;
create policy resource_topics_owner on resource_topics for all
  using (exists (select 1 from resources r where r.id = resource_id and r.user_id = auth.uid()))
  with check (exists (select 1 from resources r where r.id = resource_id and r.user_id = auth.uid()));

alter table resource_subjects enable row level security;
create policy resource_subjects_owner on resource_subjects for all
  using (exists (select 1 from resources r where r.id = resource_id and r.user_id = auth.uid()))
  with check (exists (select 1 from resources r where r.id = resource_id and r.user_id = auth.uid()));

alter table lesson_prereqs enable row level security;
create policy lesson_prereqs_owner on lesson_prereqs for all
  using (exists (select 1 from lessons l where l.id = lesson_id and l.user_id = auth.uid()))
  with check (exists (select 1 from lessons l where l.id = lesson_id and l.user_id = auth.uid()));

alter table lesson_resources enable row level security;
create policy lesson_resources_owner on lesson_resources for all
  using (exists (select 1 from lessons l where l.id = lesson_id and l.user_id = auth.uid()))
  with check (exists (select 1 from lessons l where l.id = lesson_id and l.user_id = auth.uid()));

alter table curriculum_sources enable row level security;
create policy curriculum_sources_owner on curriculum_sources for all
  using (exists (select 1 from curricula c where c.id = curriculum_id and c.user_id = auth.uid()))
  with check (exists (select 1 from curricula c where c.id = curriculum_id and c.user_id = auth.uid()));

alter table messages enable row level security;
create policy messages_owner on messages for all
  using (exists (select 1 from conversations c where c.id = conversation_id and c.user_id = auth.uid()))
  with check (exists (select 1 from conversations c where c.id = conversation_id and c.user_id = auth.uid()));

-- Ingestion jobs are written by the worker on the service role and read
-- by nobody else, but an unlocked table is an unlocked table.
alter table ingestion_jobs enable row level security;
create policy ingestion_jobs_owner on ingestion_jobs for all
  using (exists (select 1 from resources r where r.id = resource_id and r.user_id = auth.uid()))
  with check (exists (select 1 from resources r where r.id = resource_id and r.user_id = auth.uid()));

-- 3. The bucket.
--
-- Uploads are named `evidence/<uuid>.pdf`: the owner's id is not in the
-- path, so the usual foldername(name)[1] = auth.uid() policy would match
-- nothing. Ownership is established by the resources row that points at
-- the object, so that is what the policy asks. Every upload and download
-- in the app today goes through the service role and is unaffected; this
-- is what makes a direct read from the phone safe to allow later.
create policy resources_bucket_owner on storage.objects for all
  using (
    bucket_id = 'resources'
    and exists (
      select 1 from public.resources r
      where r.storage_path = storage.objects.name and r.user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'resources'
    and exists (
      select 1 from public.resources r
      where r.storage_path = storage.objects.name and r.user_id = auth.uid()
    )
  );

-- 4. Realtime.
--
-- The phone subscribes to these two to know when an ingestion lands. A
-- publication is not a grant: RLS still decides what a subscriber sees,
-- which is why this is safe to publish and why it is done here rather
-- than anywhere earlier.
alter publication supabase_realtime add table resources;
alter publication supabase_realtime add table topics;
