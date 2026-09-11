-- Single-user app: one local development account, so foreign keys
-- resolve and there is something to sign in with.
--
-- LOCAL ONLY. This never runs against a hosted project -- `supabase db
-- push` applies migrations, not seeds -- and it must not. A hosted
-- installation is claimed through the sign-in sheet on first visit,
-- which is what creates its one real account.
--
--   email:    dev@localhost
--   password: didactic-dev
--
-- pgcrypto lives in the extensions schema on a Supabase stack, so crypt
-- and gen_salt are called with that prefix rather than assuming the
-- search path.
-- The four token columns are written empty rather than left to default.
-- GoTrue scans them into Go strings, and a NULL there fails the whole
-- sign-in with "converting NULL to string is unsupported" -- a 500 from
-- /token that reads as "Database error querying schema" on the client
-- and says nothing about which column. The table allows NULL; GoTrue
-- does not.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values (
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'dev@localhost',
  extensions.crypt('didactic-dev', extensions.gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  '', '', '', ''
)
on conflict (id) do update set
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  raw_app_meta_data = excluded.raw_app_meta_data,
  -- A row seeded before this fix carries the NULLs and cannot sign in,
  -- so the update half repairs it rather than only the insert half.
  confirmation_token = '',
  recovery_token = '',
  email_change_token_new = '',
  email_change = '';

-- GoTrue resolves a password sign-in through the identity row, not the
-- user row alone, so a user without one exists but cannot sign in.
insert into auth.identities (
  id, user_id, provider_id, provider, identity_data,
  last_sign_in_at, created_at, updated_at
)
values (
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  'email',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"dev@localhost","email_verified":true,"phone_verified":false}'::jsonb,
  now(), now(), now()
)
on conflict (provider_id, provider) do nothing;
