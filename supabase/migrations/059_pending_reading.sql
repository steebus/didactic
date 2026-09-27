-- 059: what the reading said about a topic it queued.
--
-- The adjudication queue asks whether a newly read topic is one already
-- on the map. It found the other side of that question itself, when the
-- sheet was drawn, as whichever active topic was nearest in wording --
-- not the topic the reading had been unsure about, and often not one it
-- had been shown at all. Titles in one field sit close together in this
-- embedding model: "Hash Functions" is 0.83 from "JavaScript", above the
-- band the queue asks over, and was offered as "Same as JavaScript".
--
-- So the reading is kept on the topic it queued: which topic it was
-- asking about, why (`core/resolution.Reading.because`) and how sure,
-- as `core/resolution.KeptReading`. The queue asks about that pair and
-- prints the reading's own sentence. A topic queued with no reading --
-- the reading failed, or ran out of time, and it was queued on wording
-- alone -- has none, and the queue has it read when it is next opened:
-- released if it is its own topic, kept with the pair it is really
-- close to if not.
--
-- Read only while the topic is pending; left behind, harmlessly, once
-- it is decided.
--
-- Idempotent, like everything since 025: a migration merged to main is
-- applied on the push.

alter table topics
  add column if not exists pending_reading jsonb;

comment on column topics.pending_reading is
  'On a pending topic: {against, because, probability} -- the topic the reading was unsure about, and how it read. Null where it was queued on wording alone.';
