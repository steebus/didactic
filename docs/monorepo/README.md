# Didactic as a monorepo, with a mobile edition

The web app in this repository is to become one of two front ends on one
backend: the Next.js catalogue that exists today, and a React Native app
built with Expo that prints the same sheets on a phone. Both read and write
through the same Supabase project and the same API routes, share their
logic, types, tokens and copy, and are kept in step by a written parity
record rather than by hope.

Nothing in this directory is built yet. These documents are the plan, the
target shape, and the working guides that the build will follow. When a
phase lands, the guide it corresponds to is moved or copied to where the
plan says it goes, and the plan's checkbox is ticked.

| Document | What it is for |
| --- | --- |
| [PLAN.md](PLAN.md) | The execution plan: decisions, phases, tasks, gates, rollback. Start here. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | The target shape: workspaces, package boundaries, data flow, auth, caching. |
| [PARITY.md](PARITY.md) | The living feature-parity record. Every surface and capability, where it stands on each platform, and what it shares. |
| [guides/api-contract.md](guides/api-contract.md) | The API as the one backend for both apps: endpoints, auth modes, error shape, how to add one. |
| [guides/adding-a-feature.md](guides/adding-a-feature.md) | The workflow for a change that has to land on both platforms, with the checklist a PR must pass. |
| [guides/styling-on-mobile.md](guides/styling-on-mobile.md) | DESIGN.md translated to React Native, rule by rule, including what cannot be carried and what stands in for it. |
| [guides/bottom-nav.md](guides/bottom-nav.md) | The foot bar that replaces the running head, on web and on mobile. |
| [guides/mobile-dev-setup.md](guides/mobile-dev-setup.md) | Running the mobile app against local and hosted backends, building it, shipping it. |
| [agents/](agents/) | Drafts of the `CLAUDE.md` files each workspace will carry, ready to move into place. |

The product truth stays where it is: `PRODUCT.md` says what the app is,
`DESIGN.md` says what it looks like. These documents say how the second
front end is built without either of those changing meaning.
