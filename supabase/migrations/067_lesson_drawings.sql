-- Pictures drawn for a lesson.
--
-- A lesson's `picture` block may ask for a plate to be drawn where
-- nothing on Commons shows what it needs (`web/lib/drawings.ts`). Every
-- other picture is pointed at where it lives; a drawing lives nowhere
-- else, so it is kept here, under `<lesson id>/<random>.webp`.
--
-- Public, unlike `resources` and `lesson-audio`: the address is written
-- into the lesson body and printed by every client for as long as the
-- lesson stands, and a signed URL would expire out from under it. Nothing
-- in a drawing of a seed is private, and the random part of the name
-- keeps the bucket from being walked. Only the service role writes.
--
-- Safe to run twice.
insert into storage.buckets (id, name, public, allowed_mime_types)
values ('lesson-drawings', 'lesson-drawings', true, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;
