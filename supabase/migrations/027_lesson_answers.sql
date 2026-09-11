-- Questions answered inside a lesson, and what they were worth.
--
-- A `check` block was answered in place and never recorded. That was a
-- deliberate decision and the reasoning was sound: the reward for
-- answering is the explanation, and a block that quietly moved your
-- figure would make guessing expensive. What is asked for now is the
-- opposite -- a small boost for getting one right -- so the design has
-- to answer the original objection rather than ignore it:
--
--   * Only the first answer to a question counts. That is what this
--     table is for. Without it, "Ask again" is a lever you can pull
--     until the figure moves, which is worse than not scoring at all.
--   * A wrong answer subtracts nothing. It is recorded, because a
--     question you got wrong and then understood is the one that taught
--     you something, but it costs no ability.
--   * The weight is small: `answered` sits just above `marked` in
--     DEPTH_WEIGHTS, well under a skim. Answering every question in a
--     lesson must never approach reading it.
--
-- A question is identified by a hash of its own text (`questionKey`,
-- packages/core/src/answers.ts) rather than by its position in the
-- body. Positions move when a lesson is rewritten and would silently
-- transfer one question's answer to another; a hash simply stops
-- matching, which reads as unanswered -- the honest outcome, since the
-- question it recorded is no longer on the page.
alter type exposure_depth add value if not exists 'answered';

create table if not exists lesson_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  lesson_id uuid not null references lessons(id) on delete cascade,
  -- The hash from `questionKey`. Text rather than a uuid: it is derived
  -- from the question, not issued.
  question_key text not null,
  correct boolean not null,
  created_at timestamptz not null default now(),
  -- First answer wins. This is the whole anti-farming measure, so it is
  -- the database's job rather than the route's: two presses racing each
  -- other would both read "not answered yet" and both write.
  unique (user_id, lesson_id, question_key)
);

create index if not exists lesson_answers_lesson_idx
  on lesson_answers (lesson_id, user_id);

-- Owned rows, the same shape as the nine tables in 025. Idempotent for
-- the same reason that one is: this project's remote has been taken by
-- hand before.
alter table lesson_answers enable row level security;
drop policy if exists lesson_answers_owner on lesson_answers;
create policy lesson_answers_owner on lesson_answers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on table lesson_answers is
  'One row per question a reader has answered. First answer wins: the unique constraint is what stops a question being re-answered for the boost.';
