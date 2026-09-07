-- Single-user app: one local development user so foreign keys resolve.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values (
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'dev@localhost', '', now(), now()
)
on conflict (id) do nothing;
