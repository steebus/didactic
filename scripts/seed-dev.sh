#!/usr/bin/env sh
# Restore the development fixture. Integration tests wipe the tables to
# isolate themselves, so run this after `npm test` to get the sheet back.
set -e
docker exec -i supabase_db_didactic psql -U postgres -q < supabase/seed.sql
docker exec -i supabase_db_didactic psql -U postgres -q < supabase/fixtures/dev-data.sql
echo "dev fixture restored"
