-- The order a bed was laid out in: simplest first.
--
-- A sowing asks the model for a subject's topics and gets back a list.
-- That list has always had an order -- the model writes the
-- introductory ground before the advanced -- and the app threw it away
-- on the way to the database, because membership carried no order and
-- every read sorted by title. So a freshly sown bed printed
-- "Aperture, Composition, Zone System" and the reader had no way of
-- knowing where to start.
--
-- The order belongs on the membership rather than on the topic: a topic
-- sits under every subject it genuinely belongs to, and "third thing to
-- meet" is true of it in one bed and not in another. Exposure is
-- introductory in photography and advanced in a course on sensor
-- physics; one column on `topics` could only ever say one of those.
--
-- Null is the fourth case and needs no name: a topic added by hand
-- afterwards, or a bed sown before this existed. It means the bed never
-- stated where this one falls, and the outline sorts it last rather
-- than guessing at nought.
alter table topic_subjects add column if not exists position int;

comment on column topic_subjects.position is
  'Where this topic falls in the order its bed was laid out in, simplest first. Null means the bed never said.';
