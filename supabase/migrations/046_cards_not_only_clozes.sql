-- A card is not always a sentence with a hole in it.
--
-- 034 built the garden on one shape: a passage the lesson wrote, quoted
-- verbatim, with its load-bearing words taken out. The verbatim rule
-- was the whole of its honesty -- the reading and the asking were the
-- same words -- and it is also what made the cards bad. A lesson does
-- not write in sentences shaped like questions. What came back was
-- whichever sentence happened to be quotable, with whichever clause
-- happened to be removable taken out of it, so the blanks ran to eight
-- and ten words and the answer was a paraphrase the reader could not
-- have produced and could not check.
--
-- Two changes, and they are one change. A card is now written *from*
-- the lesson rather than *cut out of* it, and a card may be a question
-- and an answer rather than only a passage and a blank. Both follow
-- from the same observation: the unit worth holding is a piece of
-- terminology and what it means, and there is no reason the asking has
-- to wear the lesson's own sentence to get at it.
--
-- So the table grows three shapes where it had one:
--
--   `cloze`     — a sentence with one to three words taken out of it.
--                 Still the shape the garden is named for, but the
--                 sentence may now be written for the purpose and the
--                 blank is a term, not a clause.
--   `qa`        — a question and its answer, or a term and its
--                 definition, or the definition and the term.
--   `truefalse` — a statement, whether it holds, and one line saying
--                 why. Answered the way everything here is answered:
--                 turned over, then graded against what you thought.
--
-- `text`, `blank` and the two offsets become nullable, because a
-- question has no passage and no hole in it. What keeps the table
-- honest is `clozes_shape`: each kind must carry the columns its own
-- shape needs, so a row can never be a cloze with no blank or a
-- question with no answer. The old `clozes_blank_within_text` is
-- rewritten rather than dropped -- a blank that is present still has to
-- be inside its passage; a blank that is absent is now allowed.
--
-- `anchor` is what is left of the verbatim rule, and it is the right
-- amount of it. A card no longer has to quote the lesson, but where the
-- model can name the sentence the card came from, that sentence is kept
-- and checked against the body -- and it is what the plum wash in the
-- reading is drawn on. A card with no anchor is perfectly answerable
-- and simply is not drawn on the prose, which is exactly what already
-- happened to a cloze whose lesson had been rewritten. The wash
-- therefore keeps meaning what it always meant: *the garden is holding
-- on to this sentence*.
--
-- Nothing already planted is touched. Every standing row is a `cloze`
-- by the default, its text is its own anchor by the fallback in
-- `core/clozes.cardAnchor`, and its schedule and its review history are
-- exactly where they were. A card the reader has been answering for
-- three months does not deserve to be thrown away because the way they
-- are written has improved.
--
-- Safe to run twice, like everything since 025.

-- Which of the three shapes a row is. `cloze` is the default because
-- every row that exists when this runs is one.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'card_kind') then
    create type card_kind as enum ('cloze', 'qa', 'truefalse');
  end if;
end $$;

alter table clozes add column if not exists kind card_kind not null default 'cloze';

-- The front of a standard card: the question, the term, or the
-- statement to judge. Null on a cloze, which carries its front in
-- `text` and the hole in it.
alter table clozes add column if not exists question text;

-- The back. On a `qa` the answer or the definition; on a `truefalse`
-- the literal word `True` or `False`, stored as text rather than a
-- boolean so one column can serve both kinds and a card's back is
-- always a thing to print.
alter table clozes add column if not exists answer text;

-- One line saying *why*, shown with the back and never before it. What
-- makes a true/false card teach rather than merely score: a statement
-- judged false with no reason given is a card that leaves the reader
-- knowing they were wrong and not what is right.
alter table clozes add column if not exists note text;

-- The sentence in the lesson this came out of, quoted exactly, where
-- there is one. Checked against the body before it is written and
-- dropped to null when it is not found, so a value here is a promise
-- the painter can rely on. `prefix` goes on doing its old job for it:
-- telling two identical sentences apart.
alter table clozes add column if not exists anchor text;

comment on column clozes.kind is
  'Which shape this card is: a passage with a blank, a question and an answer, or a statement to judge. See 046.';
comment on column clozes.question is
  'The front of a standard card — the question, the term, or the statement. Null on a cloze, whose front is `text`.';
comment on column clozes.answer is
  'The back of a standard card. On a truefalse, the literal word True or False.';
comment on column clozes.note is
  'One line saying why, shown with the back and never before it. Chiefly what stops a true/false card from merely scoring.';
comment on column clozes.anchor is
  'The lesson sentence this card came from, quoted exactly, or null. What the plum wash in the reading is drawn on. A card no longer has to quote the lesson to exist — only to be drawn in it.';

-- A question has no passage and no hole in it.
alter table clozes alter column "text" drop not null;
alter table clozes alter column blank drop not null;
alter table clozes alter column blank_start drop not null;
alter table clozes alter column blank_end drop not null;

-- A blank that is there still has to be inside its passage. One that is
-- not there is now an ordinary row rather than a broken one.
alter table clozes drop constraint if exists clozes_blank_within_text;
alter table clozes add constraint clozes_blank_within_text
  check (
    blank_start is null
    or (blank_start >= 0 and blank_end > blank_start and blank_end <= length(text))
  );

-- Each kind carries what its own shape needs. This is the constraint
-- that lets every reader of this table stop guarding: a `cloze` row
-- always has a passage and a blank, a `qa` or `truefalse` row always
-- has both a front and a back.
alter table clozes drop constraint if exists clozes_shape;
alter table clozes add constraint clozes_shape
  check (
    case kind
      when 'cloze' then
        text is not null
        and blank is not null
        and blank_start is not null
        and blank_end is not null
      else
        question is not null
        and length(btrim(question)) > 0
        and answer is not null
        and length(btrim(answer)) > 0
    end
  );

-- Reading one lesson's whole deck is now an ordinary thing to do rather
-- than a thing the painter did once on mount: "Tend this lesson" prints
-- the list, and prints it in the order the cards were made. The lesson
-- index (034) is on `lesson_id` alone, so the sort was a sort.
create index if not exists clozes_lesson_made_idx
  on clozes (user_id, lesson_id, created_at);

comment on table clozes is
  'One card against one lesson: a passage with a blank in it, a question and its answer, or a statement to judge — and where FSRS says it stands. The arithmetic is packages/core/src/fsrs.ts; this table holds only what it computed. Kinds arrived in 046.';
