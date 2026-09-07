-- Development fixture: the user's real subject spread, with plausible
-- exposure history so the home screen can be judged on real shape.
delete from exposures; delete from edges; delete from resource_topics;
delete from topics; delete from resources; delete from subjects;

insert into subjects (id, user_id, title, colour) values
 ('c0000001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Front-end','#c25c3a'),
 ('c0000002-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Data & Backend','#3d4a2f'),
 ('c0000003-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','Infrastructure','#7b8a5a'),
 ('c0000004-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','AI','#8a6d3b'),
 ('c0000005-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','Economic History','#5a5f7d'),
 ('c0000006-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111','Photography','#6b4a5a'),
 ('c0000007-0000-0000-0000-000000000007','11111111-1111-1111-1111-111111111111','App Development','#8a5a3b');
-- title, subject, ability, days since exposure (null = unsown)
insert into topics (user_id, title, slug, primary_subject_id, ability, ability_confidence, last_exposure_at, created_by, summary) values
-- Front-end: the hot subject
('11111111-1111-1111-1111-111111111111','React','react','c0000001-0000-0000-0000-000000000001',3.2,0.8,now()-interval '2 days','ai','Component-based UI library.'),
('11111111-1111-1111-1111-111111111111','React Hooks','react-hooks','c0000001-0000-0000-0000-000000000001',3.4,0.9,now()-interval '3 days','ai','State and lifecycle in function components.'),
('11111111-1111-1111-1111-111111111111','JavaScript','javascript','c0000001-0000-0000-0000-000000000001',3.5,0.9,now()-interval '1 day','ai','The language of the web.'),
('11111111-1111-1111-1111-111111111111','TypeScript','typescript','c0000001-0000-0000-0000-000000000001',2.8,0.6,now()-interval '9 days','ai','Typed superset of JavaScript.'),
('11111111-1111-1111-1111-111111111111','CSS Layout','css-layout','c0000001-0000-0000-0000-000000000001',3.0,0.7,now()-interval '21 days','ai','Grid, flexbox, and flow.'),
('11111111-1111-1111-1111-111111111111','React Native','react-native','c0000001-0000-0000-0000-000000000001',1.8,0.3,now()-interval '180 days','ai','React for native platforms.'),
('11111111-1111-1111-1111-111111111111','Web Accessibility','web-accessibility','c0000001-0000-0000-0000-000000000001',2.2,0.4,now()-interval '140 days','ai','Building for everyone.'),
-- Data & Backend
('11111111-1111-1111-1111-111111111111','PostgreSQL','postgresql','c0000002-0000-0000-0000-000000000002',2.9,0.7,now()-interval '5 days','ai','Relational database.'),
('11111111-1111-1111-1111-111111111111','Supabase','supabase','c0000002-0000-0000-0000-000000000002',3.1,0.7,now()-interval '4 days','ai','Postgres platform with auth and storage.'),
('11111111-1111-1111-1111-111111111111','Row Level Security','row-level-security','c0000002-0000-0000-0000-000000000002',2.0,0.4,now()-interval '95 days','ai','Per-row access policy in Postgres.'),
('11111111-1111-1111-1111-111111111111','Database Indexing','database-indexing','c0000002-0000-0000-0000-000000000002',2.4,0.5,now()-interval '60 days','ai','B-trees, HNSW, and query plans.'),
('11111111-1111-1111-1111-111111111111','Auth','auth','c0000002-0000-0000-0000-000000000002',2.6,0.6,now()-interval '30 days','ai','Identity, sessions, and tokens.'),
('11111111-1111-1111-1111-111111111111','SQL Window Functions','sql-window-functions','c0000002-0000-0000-0000-000000000002',1.4,0.2,null,'ai','Aggregates over partitions.'),
-- Infrastructure: mostly dormant
('11111111-1111-1111-1111-111111111111','CDN Distribution','cdn-distribution','c0000003-0000-0000-0000-000000000003',2.3,0.5,now()-interval '210 days','ai','Edge caching and origin shielding.'),
('11111111-1111-1111-1111-111111111111','Caching Strategy','caching-strategy','c0000003-0000-0000-0000-000000000003',2.5,0.5,now()-interval '190 days','ai','Invalidation, TTLs, and layers.'),
('11111111-1111-1111-1111-111111111111','Edge Functions','edge-functions','c0000003-0000-0000-0000-000000000003',2.1,0.4,now()-interval '75 days','ai','Compute at the edge.'),
('11111111-1111-1111-1111-111111111111','DNS','dns','c0000003-0000-0000-0000-000000000003',2.0,0.3,now()-interval '320 days','ai','Name resolution.'),
-- AI
('11111111-1111-1111-1111-111111111111','Embeddings','embeddings','c0000004-0000-0000-0000-000000000004',2.7,0.6,now()-interval '6 days','ai','Vectors that carry meaning.'),
('11111111-1111-1111-1111-111111111111','Vector Search','vector-search','c0000004-0000-0000-0000-000000000004',2.5,0.5,now()-interval '7 days','ai','Nearest-neighbour retrieval.'),
('11111111-1111-1111-1111-111111111111','Prompt Design','prompt-design','c0000004-0000-0000-0000-000000000004',3.0,0.7,now()-interval '2 days','ai','Structuring model instructions.'),
('11111111-1111-1111-1111-111111111111','RAG','rag','c0000004-0000-0000-0000-000000000004',1.9,0.3,now()-interval '110 days','ai','Retrieval-augmented generation.'),
('11111111-1111-1111-1111-111111111111','Fine-tuning','fine-tuning','c0000004-0000-0000-0000-000000000004',1.2,0.1,null,'ai','Adapting a model to a domain.'),
-- Economic History: cold but real
('11111111-1111-1111-1111-111111111111','Milton Friedman','milton-friedman','c0000005-0000-0000-0000-000000000005',2.4,0.5,now()-interval '45 days','ai','Monetarism and the Chicago school.'),
('11111111-1111-1111-1111-111111111111','Keynesianism','keynesianism','c0000005-0000-0000-0000-000000000005',2.2,0.4,now()-interval '52 days','ai','Demand management and the multiplier.'),
('11111111-1111-1111-1111-111111111111','Industrial Revolution','industrial-revolution','c0000005-0000-0000-0000-000000000005',2.6,0.5,now()-interval '150 days','ai','Mechanisation and its social cost.'),
('11111111-1111-1111-1111-111111111111','Bretton Woods','bretton-woods','c0000005-0000-0000-0000-000000000005',1.6,0.2,now()-interval '240 days','ai','Postwar monetary order.'),
-- Photography: quietest
('11111111-1111-1111-1111-111111111111','Exposure Triangle','exposure-triangle','c0000006-0000-0000-0000-000000000006',3.3,0.8,now()-interval '35 days','ai','Aperture, shutter, ISO.'),
('11111111-1111-1111-1111-111111111111','Composition','composition','c0000006-0000-0000-0000-000000000006',2.8,0.6,now()-interval '88 days','ai','Framing and visual weight.'),
('11111111-1111-1111-1111-111111111111','Darkroom Printing','darkroom-printing','c0000006-0000-0000-0000-000000000006',1.5,0.2,null,'ai','Enlarger, trays, and safelight.'),
-- Two topics under one subject with nothing to say to each other, both
-- resting on a third. This is the shape the join table exists for.
('11111111-1111-1111-1111-111111111111','Portrait Photography','portrait-photography','c0000006-0000-0000-0000-000000000006',2.1,0.4,now()-interval '64 days','ai','Lighting and rapport with a sitter.'),
('11111111-1111-1111-1111-111111111111','Landscape Photography','landscape-photography','c0000006-0000-0000-0000-000000000006',1.9,0.3,now()-interval '120 days','ai','Light, weather, and waiting.'),
-- Pending adjudication
('11111111-1111-1111-1111-111111111111','Server Components','server-components','c0000001-0000-0000-0000-000000000001',1.0,0.0,null,'ai','Rendering on the server.');

update topics set state = 'pending' where slug = 'server-components';

select count(*) as topics, count(*) filter (where state='pending') as pending from topics;
insert into resources (id, user_id, url, title, kind, status, added_at, consumed_at, summary) values
('a0000001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','https://react.dev/reference/react','React Reference: Hooks','article','consumed',now()-interval '3 days',now()-interval '3 days','The official hooks API.'),
('a0000002-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','https://supabase.com/docs/guides/database','Supabase Database Guide','article','consumed',now()-interval '5 days',now()-interval '4 days','Postgres on Supabase.'),
('a0000003-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','https://www.postgresql.org/docs/current/indexes.html','PostgreSQL Indexes','article','queued',now()-interval '2 days',null,null),
('a0000004-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111',null,'Capitalism and Freedom','book','queued',now()-interval '11 days',null,null),
('a0000005-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','https://web.dev/articles/cls','Cumulative Layout Shift','article','queued',now()-interval '1 day',null,null),
('a0000006-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111',null,'The Making of the English Working Class','book','queued',now()-interval '26 days',null,null),
('a0000007-0000-0000-0000-000000000007','11111111-1111-1111-1111-111111111111','https://arxiv.org/abs/2005.11401','Retrieval-Augmented Generation','pdf','queued',now()-interval '8 days',null,null),
('a0000008-0000-0000-0000-000000000008','11111111-1111-1111-1111-111111111111',null,'Notes from setting up the photo app','note','consumed',now()-interval '2 days',now()-interval '2 days','Built a basic sharing flow.');

insert into resource_topics (resource_id, topic_id, relevance)
select 'a0000003-0000-0000-0000-000000000003'::uuid, id, 0.9 from topics where slug='database-indexing'
union all select 'a0000004-0000-0000-0000-000000000004'::uuid, id, 0.9 from topics where slug='milton-friedman'
union all select 'a0000005-0000-0000-0000-000000000005'::uuid, id, 0.8 from topics where slug='css-layout'
union all select 'a0000006-0000-0000-0000-000000000006'::uuid, id, 0.8 from topics where slug='industrial-revolution'
union all select 'a0000007-0000-0000-0000-000000000007'::uuid, id, 0.9 from topics where slug='rag'
union all select 'a0000007-0000-0000-0000-000000000007'::uuid, id, 0.5 from topics where slug='embeddings'
union all select 'a0000001-0000-0000-0000-000000000001'::uuid, id, 0.9 from topics where slug='react-hooks'
union all select 'a0000002-0000-0000-0000-000000000002'::uuid, id, 0.9 from topics where slug='supabase';

-- Edges so the graph has structure
insert into edges (user_id, from_topic, to_topic, kind, weight, created_by)
select '11111111-1111-1111-1111-111111111111'::uuid, a.id, b.id, 'prereq'::edge_kind, 0.9, 'ai'::created_by_kind
from topics a, topics b where a.slug='javascript' and b.slug='react'
union all select '11111111-1111-1111-1111-111111111111'::uuid, a.id, b.id, 'specialises'::edge_kind, 0.9, 'ai'::created_by_kind
from topics a, topics b where a.slug='react' and b.slug='react-hooks'
union all select '11111111-1111-1111-1111-111111111111'::uuid, a.id, b.id, 'alternative'::edge_kind, 0.7, 'ai'::created_by_kind
from topics a, topics b where a.slug='javascript' and b.slug='typescript'
union all select '11111111-1111-1111-1111-111111111111'::uuid, a.id, b.id, 'specialises'::edge_kind, 0.8, 'ai'::created_by_kind
from topics a, topics b where a.slug='react' and b.slug='react-native'
union all select '11111111-1111-1111-1111-111111111111'::uuid, a.id, b.id, 'related'::edge_kind, 0.8, 'ai'::created_by_kind
from topics a, topics b where a.slug='postgresql' and b.slug='supabase'
union all select '11111111-1111-1111-1111-111111111111'::uuid, a.id, b.id, 'related'::edge_kind, 0.7, 'ai'::created_by_kind
from topics a, topics b where a.slug='embeddings' and b.slug='vector-search'
union all select '11111111-1111-1111-1111-111111111111'::uuid, a.id, b.id, 'prereq'::edge_kind, 0.8, 'ai'::created_by_kind
from topics a, topics b where a.slug='vector-search' and b.slug='rag'
union all select '11111111-1111-1111-1111-111111111111'::uuid, a.id, b.id, 'alternative'::edge_kind, 0.8, 'ai'::created_by_kind
from topics a, topics b where a.slug='keynesianism' and b.slug='milton-friedman';

select (select count(*) from resources) as resources,
       (select count(*) from resources where status='queued') as queued,
       (select count(*) from edges) as edges;
create or replace function seed_edge(s1 text, s2 text, k edge_kind, w numeric)
returns void language sql as $$
  insert into edges (user_id, from_topic, to_topic, kind, weight, created_by)
  select '11111111-1111-1111-1111-111111111111'::uuid,
         (select id from topics where slug = s1),
         (select id from topics where slug = s2),
         k, w, 'ai'
  where exists (select 1 from topics where slug = s1)
    and exists (select 1 from topics where slug = s2)
  on conflict do nothing;
$$;

select seed_edge('javascript','react','prereq',0.9);
select seed_edge('react','react-hooks','specialises',0.9);
select seed_edge('javascript','typescript','alternative',0.7);
select seed_edge('react','react-native','specialises',0.8);
select seed_edge('typescript','react','related',0.6);
select seed_edge('css-layout','react','related',0.5);
select seed_edge('postgresql','supabase','related',0.8);
select seed_edge('postgresql','database-indexing','specialises',0.9);
select seed_edge('supabase','auth','related',0.7);
select seed_edge('supabase','row-level-security','specialises',0.8);
select seed_edge('supabase','edge-functions','related',0.7);
select seed_edge('postgresql','sql-window-functions','specialises',0.8);
select seed_edge('embeddings','vector-search','prereq',0.9);
select seed_edge('vector-search','rag','prereq',0.8);
select seed_edge('embeddings','database-indexing','related',0.5);
select seed_edge('prompt-design','rag','related',0.6);
select seed_edge('rag','fine-tuning','alternative',0.7);
select seed_edge('cdn-distribution','caching-strategy','related',0.8);
select seed_edge('dns','cdn-distribution','prereq',0.7);
select seed_edge('edge-functions','cdn-distribution','related',0.6);
select seed_edge('keynesianism','milton-friedman','alternative',0.9);
select seed_edge('industrial-revolution','keynesianism','prereq',0.5);
select seed_edge('bretton-woods','keynesianism','related',0.7);
select seed_edge('exposure-triangle','composition','related',0.5);
select seed_edge('exposure-triangle','darkroom-printing','related',0.6);

drop function seed_edge(text,text,edge_kind,numeric);
select count(*) as edges from edges;

-- Exposure history. Ability is a rollup over this log, never set
-- directly: a figure with no record behind it is exactly what the app
-- refuses to show. Run `npm run db:seed` to apply, which recomputes.

-- Cross-filing. A topic sits under every subject it genuinely belongs
-- to, not just the one it was first sown in: JavaScript is front-end
-- work and app work both, and reading it warms both on the stock list.
-- The trigger has already filed every topic under its home subject, so
-- these are the additional memberships only.
insert into topic_subjects (topic_id, subject_id, created_by)
select t.id, 'c0000007-0000-0000-0000-000000000007', 'user'
from topics t
where t.slug in ('javascript', 'typescript', 'react-native', 'auth', 'caching-strategy')
on conflict do nothing;

-- Exposure sits under photography only, but portrait and landscape both
-- rest on it, which the graph says with prereq edges rather than by
-- duplicating the topic.
insert into edges (user_id, from_topic, to_topic, kind, weight, created_by)
select '11111111-1111-1111-1111-111111111111'::uuid,
       (select id from topics where slug = 'exposure-triangle'),
       (select id from topics where slug = s), 'prereq', 0.9, 'ai'
from (values ('portrait-photography'), ('landscape-photography')) as v(s)
on conflict do nothing;

-- One curriculum, so the curriculum and lesson pages have something
-- real to render. Approved, part-worked, and branching after the basics.
insert into curricula (id, user_id, topic_id, title, goal, shape, status, created_by, approved_at)
select 'b0000001-0000-0000-0000-000000000001',
       '11111111-1111-1111-1111-111111111111',
       id,
       'Exposure, properly',
       'Stop bracketing and guessing. Read a scene and set it in one go.',
       'branching', 'active', 'ai', now() - interval '30 days'
from topics where slug = 'exposure-triangle';

insert into lessons (id, user_id, curriculum_id, topic_id, title, slug, summary, position, stage, estimated_minutes, created_by, completed_at)
select v.id::uuid,
       '11111111-1111-1111-1111-111111111111',
       'b0000001-0000-0000-0000-000000000001',
       t.id,
       v.title, v.slug, v.summary, v.position, v.stage::lesson_stage, v.minutes, 'ai',
       case when v.done then now() - interval '30 days' else null end
from topics t, (values
  ('b1000001-0000-0000-0000-000000000001','What exposure actually is','what-exposure-is','Light, time, and sensitivity as one quantity.',0,'introductory',15,true),
  ('b1000002-0000-0000-0000-000000000002','Aperture','aperture','Depth of field, and the cost of buying light with it.',1,'introductory',20,true),
  ('b1000003-0000-0000-0000-000000000003','Shutter speed','shutter-speed','Motion, blur, and the hand-holding floor.',2,'core',20,false),
  ('b1000004-0000-0000-0000-000000000004','ISO and noise','iso-and-noise','What you give up to shoot in the dark.',3,'core',15,false),
  ('b1000005-0000-0000-0000-000000000005','Metering a scene','metering','Where the meter lies and how to correct it.',4,'core',25,false),
  ('b1000006-0000-0000-0000-000000000006','Available light indoors','available-light','Working a room without adding light.',5,'advanced',30,false),
  ('b1000007-0000-0000-0000-000000000007','Long exposure','long-exposure','Filters, tripods, and reciprocity.',6,'advanced',30,false)
) as v(id, title, slug, summary, position, stage, minutes, done)
where t.slug = 'exposure-triangle';

-- Linear through the basics, then it forks: indoors and long exposure
-- are separate pursuits off the same footing.
insert into lesson_prereqs (lesson_id, requires_lesson_id) values
 ('b1000002-0000-0000-0000-000000000002','b1000001-0000-0000-0000-000000000001'),
 ('b1000003-0000-0000-0000-000000000003','b1000001-0000-0000-0000-000000000001'),
 ('b1000004-0000-0000-0000-000000000004','b1000001-0000-0000-0000-000000000001'),
 ('b1000005-0000-0000-0000-000000000005','b1000002-0000-0000-0000-000000000002'),
 ('b1000005-0000-0000-0000-000000000005','b1000003-0000-0000-0000-000000000003'),
 ('b1000005-0000-0000-0000-000000000005','b1000004-0000-0000-0000-000000000004'),
 ('b1000006-0000-0000-0000-000000000006','b1000005-0000-0000-0000-000000000005'),
 ('b1000007-0000-0000-0000-000000000007','b1000005-0000-0000-0000-000000000005');
