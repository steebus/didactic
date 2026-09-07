-- Resource-to-node links. Written as separate statements: a chained
-- `union all ... from nodes a, nodes b` binds the FROM to the last
-- branch only, which silently produced zero rows.
delete from resource_nodes;

insert into resource_nodes (resource_id, node_id, relevance)
select 'a0000003-0000-0000-0000-000000000003', id, 0.9 from nodes where slug like 'database-indexing%';
insert into resource_nodes (resource_id, node_id, relevance)
select 'a0000004-0000-0000-0000-000000000004', id, 0.9 from nodes where slug like 'milton-friedman%';
insert into resource_nodes (resource_id, node_id, relevance)
select 'a0000004-0000-0000-0000-000000000004', id, 0.5 from nodes where slug like 'keynesianism%';
insert into resource_nodes (resource_id, node_id, relevance)
select 'a0000005-0000-0000-0000-000000000005', id, 0.8 from nodes where slug like 'css-layout%';
insert into resource_nodes (resource_id, node_id, relevance)
select 'a0000006-0000-0000-0000-000000000006', id, 0.8 from nodes where slug like 'industrial-revolution%';
insert into resource_nodes (resource_id, node_id, relevance)
select 'a0000007-0000-0000-0000-000000000007', id, 0.9 from nodes where slug like 'rag%';
insert into resource_nodes (resource_id, node_id, relevance)
select 'a0000007-0000-0000-0000-000000000007', id, 0.5 from nodes where slug like 'embeddings%';
insert into resource_nodes (resource_id, node_id, relevance)
select 'a0000001-0000-0000-0000-000000000001', id, 0.9 from nodes where slug like 'react-hooks%';
insert into resource_nodes (resource_id, node_id, relevance)
select 'a0000002-0000-0000-0000-000000000002', id, 0.9 from nodes where slug like 'supabase%';
insert into resource_nodes (resource_id, node_id, relevance)
select 'a0000008-0000-0000-0000-000000000008', id, 0.7 from nodes where slug like 'react%' and slug not like 'react-native%';

select count(*) as links from resource_nodes;
