-- Cover the foreign keys.
--
-- Postgres indexes the primary key and anything declared unique; it
-- does not index the other side of a foreign key. So every `user_id`
-- in this schema -- which is every table, because everything here
-- belongs to the one account -- was a sequential scan, and a delete
-- on the parent had to scan the child to find what pointed at it.
--
-- It does not look expensive at this size, which is exactly why it is
-- worth doing now: the one that showed was `lesson_prereqs`, scanned
-- whole on every load of the stock list, 511ms to return 67 rows.
-- That is not the rows, it is the scan. The same shape is under every
-- other key here and gets slower in step with the catalogue.
--
-- Written the way the linter names them. `if not exists` throughout,
-- so this is safe to run twice, and none of it takes a lock worth
-- worrying about at this size.

-- What the stock list reads whole, every time it is built.
create index if not exists lesson_prereqs_lesson_idx
  on lesson_prereqs (lesson_id);

-- Every row in this schema carries the owner. None of these were
-- covered.
create index if not exists cloze_concepts_user_idx on cloze_concepts (user_id);
create index if not exists conversations_user_idx on conversations (user_id);
create index if not exists curricula_user_idx on curricula (user_id);
create index if not exists edges_user_idx on edges (user_id);
create index if not exists exposures_user_idx on exposures (user_id);
create index if not exists highlight_tags_user_idx on highlight_tags (user_id);
create index if not exists highlights_user_idx on highlights (user_id);
create index if not exists lessons_user_idx on lessons (user_id);
create index if not exists resource_outline_user_idx on resource_outline (user_id);
create index if not exists resource_passages_user_idx on resource_passages (user_id);
create index if not exists subject_sowings_user_idx on subject_sowings (user_id);
create index if not exists subjects_user_idx on subjects (user_id);

-- The rest of the uncovered keys, each the child side of a join the
-- app actually walks.
--
-- Three of these the linter names for a column that no longer exists:
-- `nodes` became `topics` and its columns went with it, but the
-- constraints kept the spelling they were created under. So
-- `conversations_node_id_fkey` covers `topic_id`, `edges_to_node_fkey`
-- covers `to_topic`, and `resource_nodes_node_id_fkey` covers
-- `resource_topics.topic_id`. Indexed under the column's real name.
create index if not exists conversations_topic_idx on conversations (topic_id);
create index if not exists curriculum_sources_resource_idx on curriculum_sources (resource_id);
create index if not exists edges_to_topic_idx on edges (to_topic);
create index if not exists ingestion_jobs_resource_idx on ingestion_jobs (resource_id);
create index if not exists lesson_resources_resource_idx on lesson_resources (resource_id);
create index if not exists resource_topics_topic_idx on resource_topics (topic_id);
