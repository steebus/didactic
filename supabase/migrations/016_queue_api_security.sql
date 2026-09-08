-- The queue wrappers exist so the app never touches the pgmq schema
-- directly, but they were running as the caller, who has no rights
-- there. Every enqueue failed with "permission denied for schema pgmq"
-- and the resource was saved but never read.
--
-- security definer runs them as their owner, which is the point of the
-- wrapper. search_path is pinned because a definer function that
-- resolves names through the caller's path is how privilege escalation
-- gets in.

create or replace function enqueue_ingestion(p_resource_id uuid)
returns bigint
language sql
security definer
set search_path = pgmq, public
as $$
  select pgmq.send('ingestion', jsonb_build_object('resource_id', p_resource_id));
$$;

create or replace function read_ingestion(p_vt int default 300, p_qty int default 1)
returns table (msg_id bigint, message jsonb)
language sql
security definer
set search_path = pgmq, public
as $$
  select r.msg_id, r.message
  from pgmq.read('ingestion', p_vt, p_qty) r;
$$;

create or replace function delete_ingestion(p_msg_id bigint)
returns boolean
language sql
security definer
set search_path = pgmq, public
as $$
  select pgmq.delete('ingestion', p_msg_id);
$$;
