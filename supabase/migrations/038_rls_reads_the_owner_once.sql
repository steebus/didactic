-- Ask who is signed in once per query, not once per row.
--
-- `auth.uid()` reads a setting off the connection, and Postgres treats
-- it as volatile: in `using (auth.uid() = user_id)` it is re-evaluated
-- for every row the policy is checked against. Wrapped as
-- `(select auth.uid())` it becomes a scalar subquery, which the planner
-- runs once and folds into the plan as a constant -- the same answer,
-- one evaluation instead of N. On the join tables, where the call sits
-- inside a correlated `exists`, that is once per row of the subquery
-- too.
--
-- This changes what the policies *cost*, never what they *permit*. Each
-- one below is the definition Postgres itself reports for the policy
-- standing today, with the call wrapped and nothing else touched, so
-- the comparison, the table it reaches and the rows it admits are
-- unchanged.
--
-- Worth saying plainly: **the service role bypasses RLS**, so none of
-- this is on the path the web app takes today -- every read there goes
-- through `supabaseAdmin()`. It is the phone that will feel it, reading
-- PostgREST directly under the owner's token, and the cost grows with
-- the row count rather than with the catalogue's age. Cheapest to fix
-- while the tables are small.
--
-- Generated from `pg_policies` rather than transcribed from the
-- migrations that created them: 020, 024, 025, 027, 029, 030 and 034
-- each own some of these, and hand-copying twenty-six policies is how
-- one of them quietly ends up admitting the wrong rows.
--
-- `drop policy if exists` then create, so this is safe to run twice,
-- and every policy is recreated in the same statement that drops it.

drop policy if exists cloze_concepts_owner on cloze_concepts;
create policy cloze_concepts_owner on cloze_concepts for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists cloze_reviews_owner on cloze_reviews;
create policy cloze_reviews_owner on cloze_reviews for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists clozes_owner on clozes;
create policy clozes_owner on clozes for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists conversations_owner on conversations;
create policy conversations_owner on conversations for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists curricula_owner on curricula;
create policy curricula_owner on curricula for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists curriculum_sources_owner on curriculum_sources;
create policy curriculum_sources_owner on curriculum_sources for all
  using (EXISTS ( SELECT 1
   FROM curricula c
  WHERE ((c.id = curriculum_sources.curriculum_id) AND (c.user_id = (select auth.uid())))))
  with check (EXISTS ( SELECT 1
   FROM curricula c
  WHERE ((c.id = curriculum_sources.curriculum_id) AND (c.user_id = (select auth.uid())))));

drop policy if exists edges_owner on edges;
create policy edges_owner on edges for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists exposures_owner on exposures;
create policy exposures_owner on exposures for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists highlight_tags_owner on highlight_tags;
create policy highlight_tags_owner on highlight_tags for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists highlights_owner on highlights;
create policy highlights_owner on highlights for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists ingestion_jobs_owner on ingestion_jobs;
create policy ingestion_jobs_owner on ingestion_jobs for all
  using (EXISTS ( SELECT 1
   FROM resources r
  WHERE ((r.id = ingestion_jobs.resource_id) AND (r.user_id = (select auth.uid())))))
  with check (EXISTS ( SELECT 1
   FROM resources r
  WHERE ((r.id = ingestion_jobs.resource_id) AND (r.user_id = (select auth.uid())))));

drop policy if exists lesson_answers_owner on lesson_answers;
create policy lesson_answers_owner on lesson_answers for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists lesson_prereqs_owner on lesson_prereqs;
create policy lesson_prereqs_owner on lesson_prereqs for all
  using (EXISTS ( SELECT 1
   FROM lessons l
  WHERE ((l.id = lesson_prereqs.lesson_id) AND (l.user_id = (select auth.uid())))))
  with check (EXISTS ( SELECT 1
   FROM lessons l
  WHERE ((l.id = lesson_prereqs.lesson_id) AND (l.user_id = (select auth.uid())))));

drop policy if exists lesson_resources_owner on lesson_resources;
create policy lesson_resources_owner on lesson_resources for all
  using (EXISTS ( SELECT 1
   FROM lessons l
  WHERE ((l.id = lesson_resources.lesson_id) AND (l.user_id = (select auth.uid())))))
  with check (EXISTS ( SELECT 1
   FROM lessons l
  WHERE ((l.id = lesson_resources.lesson_id) AND (l.user_id = (select auth.uid())))));

drop policy if exists lessons_owner on lessons;
create policy lessons_owner on lessons for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists messages_owner on messages;
create policy messages_owner on messages for all
  using (EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND (c.user_id = (select auth.uid())))))
  with check (EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND (c.user_id = (select auth.uid())))));

drop policy if exists resource_outline_owner on resource_outline;
create policy resource_outline_owner on resource_outline for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists resource_passages_owner on resource_passages;
create policy resource_passages_owner on resource_passages for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists resource_subjects_owner on resource_subjects;
create policy resource_subjects_owner on resource_subjects for all
  using (EXISTS ( SELECT 1
   FROM resources r
  WHERE ((r.id = resource_subjects.resource_id) AND (r.user_id = (select auth.uid())))))
  with check (EXISTS ( SELECT 1
   FROM resources r
  WHERE ((r.id = resource_subjects.resource_id) AND (r.user_id = (select auth.uid())))));

drop policy if exists resource_topics_owner on resource_topics;
create policy resource_topics_owner on resource_topics for all
  using (EXISTS ( SELECT 1
   FROM resources r
  WHERE ((r.id = resource_topics.resource_id) AND (r.user_id = (select auth.uid())))))
  with check (EXISTS ( SELECT 1
   FROM resources r
  WHERE ((r.id = resource_topics.resource_id) AND (r.user_id = (select auth.uid())))));

drop policy if exists resources_owner on resources;
create policy resources_owner on resources for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists subject_sowings_owner on subject_sowings;
create policy subject_sowings_owner on subject_sowings for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists subjects_owner on subjects;
create policy subjects_owner on subjects for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists topic_subjects_owner on topic_subjects;
create policy topic_subjects_owner on topic_subjects for all
  using (EXISTS ( SELECT 1
   FROM topics t
  WHERE ((t.id = topic_subjects.topic_id) AND (t.user_id = (select auth.uid())))))
  with check (EXISTS ( SELECT 1
   FROM topics t
  WHERE ((t.id = topic_subjects.topic_id) AND (t.user_id = (select auth.uid())))));

drop policy if exists topics_owner on topics;
create policy topics_owner on topics for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists resources_bucket_owner on storage.objects;
create policy resources_bucket_owner on storage.objects for all
  using ((bucket_id = 'resources'::text) AND (EXISTS ( SELECT 1
   FROM public.resources r
  WHERE ((r.storage_path = objects.name) AND (r.user_id = (select auth.uid()))))))
  with check ((bucket_id = 'resources'::text) AND (EXISTS ( SELECT 1
   FROM public.resources r
  WHERE ((r.storage_path = objects.name) AND (r.user_id = (select auth.uid()))))));
