-- Invoke the ingestion worker once a minute.
--
-- The Edge Function URL and service key differ per environment, so they
-- are read from database settings rather than hardcoded. Set them once
-- per environment:
--   alter database postgres set app.edge_url = 'http://host.docker.internal:54351/functions/v1';
--   alter database postgres set app.service_key = '<service role key>';
--
-- The job is a no-op until both are set; that is deliberate, so a fresh
-- database does not spam a URL that does not exist yet.

create extension if not exists pg_net;

create or replace function run_ingestion_worker()
returns void
language plpgsql
as $$
declare
  edge_url text := current_setting('app.edge_url', true);
  service_key text := current_setting('app.service_key', true);
begin
  if edge_url is null or service_key is null then
    return;
  end if;

  perform net.http_post(
    url := edge_url || '/ingest',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || service_key,
      'Content-Type', 'application/json'
    )
  );
end;
$$;

select cron.schedule('run-ingestion', '* * * * *', 'select run_ingestion_worker()');
