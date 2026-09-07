-- pgmq lives in its own schema, which PostgREST does not expose.
-- These wrappers are the only queue surface the app calls.

create or replace function enqueue_ingestion(p_resource_id uuid)
returns bigint
language sql
as $$
  select pgmq.send('ingestion', jsonb_build_object('resource_id', p_resource_id));
$$;

create or replace function read_ingestion(p_vt int default 300, p_qty int default 1)
returns table (msg_id bigint, message jsonb)
language sql
as $$
  select r.msg_id, r.message
  from pgmq.read('ingestion', p_vt, p_qty) r;
$$;

create or replace function delete_ingestion(p_msg_id bigint)
returns boolean
language sql
as $$
  select pgmq.delete('ingestion', p_msg_id);
$$;
