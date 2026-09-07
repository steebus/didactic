#!/usr/bin/env sh
# Restore the development fixture and recompute ability from exposures.
# Integration tests wipe the tables; this puts the sheet back.
set -e
docker exec -i supabase_db_didactic psql -U postgres -q < supabase/seed.sql
docker exec -i supabase_db_didactic psql -U postgres -q < supabase/fixtures/dev-data.sql
docker exec -i supabase_db_didactic psql -U postgres -q < supabase/fixtures/links.sql
docker exec -i supabase_db_didactic psql -U postgres -q < supabase/fixtures/exposures.sql
npx vite-node scripts/recompute.ts
echo "dev fixture restored"
