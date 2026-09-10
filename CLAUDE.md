@AGENTS.md

# Shipping

Work lands on `main`. Commit and push after each impactful body of work —
a bug fixed, a feature finished, a refactor done — without being asked and
without waiting for the end of the session. Vercel builds from `main`, so
an unpushed commit is work that does not exist yet.

Before the push, run what the repo runs: `npm test`, `npm run lint`,
`npx tsc --noEmit`, and `npm run build` where the change could break one.
A push that breaks the deploy costs more than the minute the checks take.
Say what was pushed, in the first line of the reply rather than the last.

The exceptions are the ordinary ones: work the user has said to hold, and
anything they would want to see before it is live.

# The second front end

A React Native edition on the same backend, in a monorepo, is planned and
documented under `docs/monorepo/`. Start at `docs/monorepo/README.md`;
the execution plan is `docs/monorepo/PLAN.md` and the parity record is
`docs/monorepo/PARITY.md`. Until Phase 1 of that plan lands, this
repository is still the web app alone and everything above applies as
written. Any change to what a user can see or do should move its row in
the parity record in the same commit; the `parity` skill checks a diff
against it.
