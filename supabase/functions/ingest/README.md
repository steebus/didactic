# The ingestion worker

Run once a minute by `pg_cron` (`010_cron.sql`). Takes one message off
the pgmq queue and asks the app to file that resource.

## Secrets it cannot work without

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by the
platform. These two are not, and the worker files nothing until both are
set:

```
npx supabase secrets set \
  APP_URL=https://<the deployed app> \
  INTERNAL_KEY=<the same value the app has>
npx supabase functions deploy ingest
```

- **`APP_URL`** — where the app is. The worker calls
  `${APP_URL}/api/internal/ingest`. No trailing slash.
- **`INTERNAL_KEY`** — the shared secret that route checks. Invent it;
  nothing issues it. It must match `INTERNAL_KEY` in the app's own
  environment (Vercel, and `apps/web/.env` locally) exactly, or every
  call is refused with a 401.

Unset, the worker returns `not configured: … not set` and takes no
message. That is deliberate: a missing secret is not a resource that
cannot be read, and spending attempts on it would mark every queued
resource permanently failed.

## Checking it

```
# What is waiting
select * from pgmq.q_ingestion;

# Where each resource got to
select resource_id, state, attempts, error from ingestion_jobs
  order by updated_at desc limit 10;

# Run it by hand
curl -X POST "$SUPABASE_URL/functions/v1/ingest" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY"
```

It answers `idle` (nothing queued), `ok` (one filed), `failed (attempt
n)`, or a line saying what it dropped or what is unset.

## The rule this file exists to protect

**Every path out of the handler either deletes its message or leaves it
to be redelivered on purpose.** The queue is ordered: a message that can
be taken and neither finished nor given up blocks every resource behind
it, forever, and silently. That is exactly what happened when a resource
was deleted before it was read — the worker asked for its job row with
`.single()`, ignored the error, and then updated nothing, retried
nothing and deleted nothing for the life of the database.
