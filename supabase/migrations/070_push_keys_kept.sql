-- 070: the push key pair, kept in the database rather than set by hand.
--
-- Tend reminders (069) are signed with the app's VAPID pair, which
-- identifies this server to the phone's push service. It was read from
-- two environment variables somebody had to generate and paste into
-- Vercel. The app now makes the pair itself the first time a phone asks
-- for it and keeps it here, beside the round's own key, in the one-row
-- table only the service role can read.
--
-- The pair must not change once a phone has subscribed against it:
-- every subscription is bound to the public key it was made with. The
-- app only ever writes it where it is still empty.
--
-- Idempotent.

alter table push_rounds add column if not exists vapid_public text;
alter table push_rounds add column if not exists vapid_private text;

comment on column push_rounds.vapid_public is
  'The app''s VAPID public key, made by the app on first use. Every push subscription is bound to it: never change it.';
comment on column push_rounds.vapid_private is
  'The private half of the VAPID pair. Service role only.';
