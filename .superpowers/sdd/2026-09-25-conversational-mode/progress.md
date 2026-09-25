# SDD ledger — plan: docs/superpowers/plans/2026-09-25-conversational-mode.md

Executing inline on `main`, at the user's explicit direction: the migrations
are additive, and CLAUDE.md says work lands on main.

Pre-flight: shared interfaces checked.
- T2 produces AskContext/Proposal/AgentWrite → consumed by T3, T5, T6, T7. Names agree.
- T4 produces foldInto(body, sectionId, section) → consumed by T6 fold route. Agrees.
- T5 produces askTurn/AskDeps → consumed by T6 turn route. Agrees.
- T6 produces api.ask.{say,accept,undo,fold} → consumed by T7, T8. Agrees.

Task 1: Ruling: the migration is split in two — 050 carries the
`conversation_kind` value alone, 051 carries the columns, table, index and
RLS. Postgres forbids *using* an enum value in the transaction that adds it
and the runner wraps each file in one; 013 and 041 already set this
convention in this repo, and the plan's single-file version would have
failed on the way in. Also uses `add value if not exists` rather than the
plan's `do $$` block, matching the existing files. Cost if wrong: none — two
files instead of one, both additive.
Task 1: complete (commits 2a8783f, migrations applied from scratch + idempotent re-run)
Task 2+4: complete (commits e985627, tests: core 13/13 ask, suite green). Ruling: foldInto written here with Task 2 rather than as its own Task 4 — it is one module and one test file, and splitting the commit would have added nothing. Cost if wrong: none.
Task 5: complete (commits 1691563, tests: ask-agent 7/7 verified RED->GREEN by mutation). Ruling: plan said 'thinking' was spread as ...NO_THINKING; it is a ThinkingConfigParam passed as thinking: NO_THINKING, per grouping.ts:93. Cost if wrong: none, the call would not have typechecked. Ruling: agent-loop tests written here rather than deferred to the route task — the loop branches and deserved its own cover.
Task 6: complete (commits 9721b12, tests: ask-route 10/10, mutation-verified). Ruling: endpoints.ts is a keyed record, not the array the plan showed; rows written in the real shape. Ruling: added an owner check on a carried conversationId in the turn, accept and fold routes — the plan omitted it and the id arrives from a browser. Cost if wrong: none, it is a narrowing. Ruling: undoWrite dropped the unused conversationId parameter the plan gave it.
