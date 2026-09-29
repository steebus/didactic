<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Where Next lives

`next` is installed in `apps/web`, not at the repo root. The docs the block
above sends you to are at `apps/web/node_modules/next/dist/docs/` (npm
workspaces hoist most packages to the root `node_modules`, so check both).
Run the app's own checks from `apps/web`, or through turbo at the root.

The env files live in `apps/web`, which is where Next looks for them: its
project directory, not the repo root. Nothing at the root loads them
implicitly, so `scripts/` are run with `NODE_OPTIONS=--env-file=apps/web/.env`
(see `scripts/seed-dev.sh`), and `turbo.json` names the four variables the
build needs, because turbo runs tasks in strict env mode and passes on only
what a task declares.

