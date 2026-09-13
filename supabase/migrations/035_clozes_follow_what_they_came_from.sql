-- A cloze goes when the thing it was cut from goes.
--
-- 034 filed three foreign keys as `on delete set null`. Two of them
-- were copied from `highlights` (020/022) without the reason, and the
-- third was believed to be a cascade by the code that depends on it.
-- Both mistakes have the same shape: a row that should have died
-- quietly survives, and is offered to the reader later as a question
-- about something that is no longer there.
--
-- **`clozes.concept_id` and the regeneration.** This one is a live bug,
-- not a latent one. Asking for a lesson to be read again deletes its
-- concepts and writes a new set (`sowClozes`, `regenerate`), and the
-- comment there says the clozes go with the concepts by cascade. They
-- did not: `set null` left every old cloze standing, stripped of the
-- concept that gave it its name, and the new set was written alongside
-- it -- so the one path that exists to *replace* a lesson's cards
-- doubled them instead, and did it again on every press. Cascading is
-- what that code always meant. A cloze the reader made by hand belongs
-- to no concept and is untouched by it, which is the other half of what
-- was meant.
--
-- **`topic_id`, on both tables.** A mark is something the reader wrote,
-- and it deliberately outlives the lesson and the topic it was taken in
-- -- that is what 022 is for. A cloze is not that. It is a question cut
-- from one lesson's own sentence about one topic's material, and a
-- topic that has been grubbed out has no material to ask about.
--
-- In practice those rows already went: a topic takes its curricula
-- (014), a curriculum takes its lessons, and a lesson takes its
-- concepts and clozes, so grubbing out a topic -- or a subject, which
-- deletes the topics no other subject holds before deleting itself --
-- left nothing behind. Verified against Postgres rather than reasoned
-- about. What was wrong was the statement of intent: `set null` says
-- *a cloze survives its topic, filed under nothing*, which is the
-- opposite of what is wanted, and is only unreachable because every
-- cloze today carries the topic of the curriculum its lesson sits in.
-- The day anything files one across -- a cloze from a refresher, a
-- lesson re-filed -- that row outlives the bed and is asked of a reader
-- who has no way to act on it: Edit, and the lesson behind it, are
-- gone too.
--
-- The constraints are found by what they constrain rather than by name.
-- 034 did not name them, so they carry whatever Postgres called them,
-- and a migration that guesses a name is a migration that fails on the
-- one database it was needed for. Safe to run twice, like everything
-- since 025.

do $$
declare
  tightened record;
  found text;
begin
  for tightened in
    select *
    from (values
      ('clozes',         'concept_id', 'cloze_concepts'),
      ('clozes',         'topic_id',   'topics'),
      ('cloze_concepts', 'topic_id',   'topics')
    ) as t(child, column_name, parent)
  loop
    select con.conname into found
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = tightened.child
      and con.contype = 'f'
      and con.conkey = array[
        (select attnum from pg_attribute
          where attrelid = rel.oid
            and attname = tightened.column_name
            and not attisdropped)
      ];

    if found is not null then
      execute format('alter table %I drop constraint %I', tightened.child, found);
      found := null;
    end if;

    execute format(
      'alter table %I add constraint %I foreign key (%I)
         references %I(id) on delete cascade',
      tightened.child,
      tightened.child || '_' || tightened.column_name || '_fkey',
      tightened.column_name,
      tightened.parent
    );
  end loop;
end $$;

comment on column clozes.concept_id is
  'The concept this asks about, where an agent named one. Cascades: reading a lesson again replaces its concepts, and the cards under them go with them. Null for a cloze the reader made by hand over a passage they chose, which no regeneration touches.';

comment on column clozes.topic_id is
  'The topic whose material this asks about. Cascades: a topic that has been grubbed out has no material to ask about. Unlike a mark, which outlives its topic on purpose (022).';

comment on column cloze_concepts.topic_id is
  'As clozes.topic_id: the concept goes when the topic does.';
