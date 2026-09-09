-- A marked passage outlives the lesson it was taken from.
--
-- highlights.lesson_id cascaded, so deleting a subject took its topics,
-- their curricula, those curricula's lessons, and every passage ever
-- marked while reading them. The words a reader chose to keep are the
-- least replaceable thing in the app -- a lesson body is regenerable
-- and a topic can be sown again, but nobody can reconstruct which
-- sentence struck someone as worth keeping.
--
-- Both parents become `set null`. A mark with no lesson and no topic is
-- still a quote and a note, and the Marked sheet already prints one
-- without either. What is lost is where it came from, which is a
-- caption; what survives is the passage, which is the record.
alter table highlights
  drop constraint if exists highlights_lesson_id_fkey,
  add constraint highlights_lesson_id_fkey
    foreign key (lesson_id) references lessons(id) on delete set null;

alter table highlights
  alter column lesson_id drop not null;

alter table highlights
  drop constraint if exists highlights_topic_id_fkey,
  add constraint highlights_topic_id_fkey
    foreign key (topic_id) references topics(id) on delete set null;
