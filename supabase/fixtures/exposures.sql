-- Vary exposure counts so the map has real texture rather than one
-- uniform figure. Depth and volume differ per subject, the way real
-- attention does.
delete from exposures;

-- Heavy, applied subjects: the things worked on daily.
insert into exposures (user_id, topic_id, source, depth, ability_delta, reason, created_at)
select n.user_id, n.id, 'agent', 'applied', 0,
       (array['shipped a feature using ','debugged a problem in ','refactored code with ','paired on ','reviewed a PR touching ','built a prototype with '])[g+1] || n.title,
       n.last_exposure_at - (g * 14 || ' days')::interval
from topics n, generate_series(0, 5) g
where n.slug in ('javascript','react','react-hooks','typescript','css-layout');

-- Applied but less often.
insert into exposures (user_id, topic_id, source, depth, ability_delta, reason, created_at)
select n.user_id, n.id, 'agent', 'applied', 0,
       (array['used ','set up ','configured '])[g+1] || n.title || ' on a project',
       n.last_exposure_at - (g * 30 || ' days')::interval
from topics n, generate_series(0, 2) g
where n.slug in ('supabase','postgresql','prompt-design','exposure-triangle','auth');

-- Read widely, never applied: the reading-only ceiling should bite.
insert into exposures (user_id, topic_id, source, depth, ability_delta, reason, created_at)
select n.user_id, n.id, 'resource', 'read', 0,
       'read of "' || n.title || '", part ' || g,
       n.last_exposure_at - (g * 21 || ' days')::interval
from topics n, generate_series(0, 7) g
where n.slug in ('milton-friedman','keynesianism','industrial-revolution','embeddings','vector-search','composition','database-indexing','caching-strategy');

-- Skimmed once or twice: barely touched.
insert into exposures (user_id, topic_id, source, depth, ability_delta, reason, created_at)
select n.user_id, n.id, 'resource', 'skim', 0,
       'skim of "' || n.title || ' explained"',
       n.last_exposure_at - (g * 40 || ' days')::interval
from topics n, generate_series(0, 1) g
where n.slug in ('dns','bretton-woods','react-native','web-accessibility','rag','row-level-security','edge-functions','cdn-distribution');

select count(*) as exposures, count(distinct topic_id) as topics_with_record from exposures;
