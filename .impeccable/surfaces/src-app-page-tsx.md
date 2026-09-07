---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: []
---

## Scope

Home screen (`src/app/page.tsx`): the cluster overview and the four panels.
Visitor mode: **Operate**. This surface establishes the visual world for the
whole app; the graph view, node detail, inbox, and refresher inherit it.

## Audience and job

One user, a front-end developer learning across a wide spread of technical and
non-technical subjects. Two sessions: desktop deep exploration, and mobile
capture or check-in. The job on this surface is a glance — what have I been
feeding, what has gone cold, what have I stockpiled and not read — followed by
one click into a cluster, a resource, or a refresher.

## Content and constraints

Real data only: cluster cells with node counts and computed aggregates, hot
and cold node lists, queued-unread resources, one suggested next move. Empty
states are the first-run reality and must be designed, not deferred.

Ability is app-owned and cannot be overridden, so the reasoning display is
load-bearing. Low confidence must look vague rather than precise. Colour alone
may never encode ability or freshness. The graph must work on a phone.

Ruled out by the user: productivity SaaS dashboard, gamified learning app,
generic AI product, sterile developer tooling.

## Direction contract

THESIS: Subjects as a grower's stock inventory — every node carries a
viability figure and a dormancy state, because knowledge is perishable and the
honest question is what is still viable. Refuses the knowledge-graph default
of a dark canvas with glowing force-directed nodes, and refuses the dashboard
grid of KPI cards.

OWN-WORLD: The saturated mid-century catalogue, not its antiques-shop memory.
Chromolithograph plate colour — deep bottle green, terracotta, mustard,
ultramarine — on a warm newsprint ground, ink at near-black brown. Dense
tabular listings with rules and leader dots; agate-scale marginal data; number
columns set tabular and right-aligned. Viability as a printed percentage
beside every entry. Dormancy shown by hatch pattern and stock rule, never by
colour alone. Plates are illustrated cluster emblems, saturated and flat.

STORY: The visitor reads their stock at a glance — what is in season, what is
dormant, what is unsown — then acts on one entry.

FIRST VIEWPORT: Full-bleed catalogue spread. Left two-thirds: cluster stock
listing, each cluster a row with its plate emblem, node count, viability
figure, and a hatched dormancy bar; rows sized by holding. Right third: the
margin, carrying four printed blocks in order — In Season, Going Dormant,
Unsown Stock, and This Season's Recommendation, which holds the primary
action. Sheet head carries the product name, the survey date, and totals.

FORM: The Seed Catalogue, candidate 5 of 7 on the grounded list, chosen by the
user from the pick card over the assigned roll. Seed key 0865a26a.

FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying its
provenance.

## Unresolved

No image generation on this machine, so the build is code-led and no comp
exists. Cluster plate emblems must be authored in code (flat vector forms) or
supplied by the user later; they are not photographic.
