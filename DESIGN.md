---
name: Didactic
description: A living map of what you are learning, printed as a grower's seed catalogue.
colors:
  paper: "#efe7d6"
  paper-deep: "#e3d8c2"
  paper-edge: "#d5c8ae"
  press-bed: "#ddd2ba"
  ink: "#241d16"
  ink-soft: "#574a3b"
  ink-faint: "#6b5c45"
  plate-green: "#2f5233"
  plate-terracotta: "#b8482a"
  plate-mustard: "#c8871a"
  plate-ultramarine: "#2a4a7c"
  plate-plum: "#6b3550"
  plate-olive: "#6b7233"
  rule: "#b9a988"
  rule-strong: "#6b5c45"
typography:
  display:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "clamp(3rem, 6vw, 5rem)"
    lineHeight: 0.9
    letterSpacing: "-0.03em"
    fontVariation: "'SOFT' 40, 'WONK' 1, 'opsz' 120"
  headline:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "2.5rem"
    lineHeight: 0.95
    letterSpacing: "-0.02em"
    fontVariation: "'SOFT' 40, 'WONK' 1, 'opsz' 72"
  title:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "1.75rem"
    fontVariation: "'SOFT' 30, 'WONK' 1, 'opsz' 40"
  figure:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "1.75rem"
    fontVariation: "'SOFT' 10, 'WONK' 0, 'opsz' 30"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.9375rem"
    lineHeight: 1.55
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.6875rem"
    letterSpacing: "0.1em"
    textTransform: "uppercase"
rounded:
  none: "0"
spacing:
  1: "0.25rem"
  2: "0.5rem"
  3: "0.875rem"
  4: "1.375rem"
  5: "2.25rem"
  6: "3.5rem"
components:
  button-primary:
    backgroundColor: "{colors.plate-green}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "0.875rem 2.25rem"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.plate-terracotta}"
    textColor: "{colors.paper}"
  masthead:
    backgroundColor: "{colors.plate-green}"
    textColor: "{colors.paper}"
    padding: "2.25rem"
  sheet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
  block:
    backgroundColor: "{colors.paper-deep}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "1.375rem"
  mark:
    backgroundColor: "{colors.plate-mustard}"
    textColor: "{colors.ink}"
---

# Didactic — Design System

The world is **The Seed Catalogue**: a grower's stock inventory printed at full
chromolithograph saturation on warm newsprint. Knowledge is perishable, so every
entry carries a viability figure and a dormancy state.

This document records the system **as built**, from `src/app/globals.css`, the
eight surface stylesheets, and the shared components. Where the direction
contract and the shipped code diverge, the code is recorded and the divergence
is named. Values used once are not recorded here; a token used once is not a
system.

Machine-readable tokens: `.impeccable/design-tokens.json`.

---

## 1. Ground and Materials

The build is a **printed object read in daylight**. There is no dark mode and no
`prefers-color-scheme` branch anywhere in the stylesheets. This is the system, not
a gap: a catalogue sheet has one side and one lighting condition.

### Grounds

| Token | Value | Role |
| --- | --- | --- |
| `--paper` | `#efe7d6` | The sheet. Warm catalogue newsprint, not cream. |
| `--paper-deep` | `#e3d8c2` | Row hover, one step into the stock. |
| `--paper-edge` | `#d5c8ae` | Sheet trims and inset edges. |
| `--press-bed` | `#ddd2ba` | The darker surface the sheet lies on. `body` only. |

### Inks

| Token | Value | Role |
| --- | --- | --- |
| `--ink` | `#241d16` | Body and headings. Warm near-black, letterpress on absorbent stock. |
| `--ink-soft` | `#574a3b` | Secondary prose, meta rows, panel captions. |
| `--ink-faint` | `#6b5c45` | Agate marginalia, figure labels, dates, empty-state notes. |

### Plate inks

Six saturated chromolithograph plates. They are **subject identity and structural
ink**, never decoration and never a mood layer.

| Token | Value | Where the build uses it |
| --- | --- | --- |
| `--plate-green` | `#2f5233` | Default masthead band; the recommendation block; the graph control strip; primary action fills. |
| `--plate-terracotta` | `#b8482a` | The single interactive accent: link hover, focus ring, destructive/queued flags. |
| `--plate-mustard` | `#c8871a` | The head rule; underline on every action link; `::selection`; checkbox accent. |
| `--plate-ultramarine` | `#2a4a7c` | Curriculum masthead band — the one surface that changes plate. |
| `--plate-plum` | `#6b3550` | Subject plate assignment. |
| `--plate-olive` | `#6b7233` | Subject plate assignment. |

### Rules

| Token | Value | Role |
| --- | --- | --- |
| `--rule` | `#b9a988` | Standard table rule, leader dots, scrollbar thumb, link underline at rest. |
| `--rule-strong` | `#6b5c45` | Section-defining rules, sheet foot, panel edges, form field borders. |

**Palette strategy:** one warm paper ground with a darker bed behind it; a
three-step warm-black ink ramp; six flat plate inks that carry meaning
(subject identity, band structure, one interactive accent) and never atmosphere.
No gradients as colour — the only gradients in the build are the paper-tooth
threads and the SVG hatch patterns, both of which are texture.

### Paper tooth

Two fine directional threads as `repeating-linear-gradient`, never a noise
overlay or a raster texture:

```
repeating-linear-gradient(90deg, rgba(90,70,45,0.04) 0 1px, transparent 1px 3px),
repeating-linear-gradient(0deg,  rgba(90,70,45,0.03) 0 1px, transparent 1px 4px)
```

On `body` the same threads run at `0.035` / `0.025` over `--press-bed`. The
tooth belongs to the sheet and the bed both, at slightly different weights.

The graph bed uses a different texture in the same family: a 48px drill grid at
`rgba(107,92,69,0.06)`, ruled the way a planting plan is ruled.

---

## 2. Type

Two families, loaded through `next/font` in `src/app/layout.tsx`. No system
display face anywhere.

- **Fraunces** (variable, axes `SOFT` / `WONK` / `opsz`) — `--font-display`.
  Titles, figures, prose headings, the viability number.
- **Archivo** — `--font-text`. Body, tables, all uppercase labels, form controls,
  graph node labels.

`body` sets `font-variant-numeric: tabular-nums` globally; figure cells add
`lining-nums`. Every number in the build is column-safe by default.

### Ramp

| Token | Value | Used as |
| --- | --- | --- |
| `--step--2` | `0.6875rem` | Agate: uppercase labels, marginalia, dates, foot. |
| `--step--1` | `0.8125rem` | Meta rows, block rows, edition line, form controls. |
| `--step-0` | `0.9375rem` | Body default. |
| `--step-1` | `1.25rem` | Entry titles, panel figures, prose body. |
| `--step-2` | `1.75rem` | Section titles, viability figure, panel titles. |
| `--step-3` | `2.5rem` | Surface titles on every non-home sheet. |
| `--step-4` | `clamp(3rem, 6vw, 5rem)` | The home masthead alone. |

**Ramp shape:** catalogue-tight and bottom-heavy. Four of the seven steps sit at
or below body size, because the world's density lives in agate marginalia; the
top two steps appear only in mastheads. The ratio is loose at the bottom
(≈1.18) and widens toward the top (≈1.4), which is how a stock table sets a
title against its rows.

### Variation settings — a role system, not per-element taste

`opsz` tracks the size the text is actually set at; `SOFT` rises with size;
`WONK` is on for anything that reads as a headline and off for figures and
supporting display text.

| Role | Setting | Size |
| --- | --- | --- |
| Home masthead | `'SOFT' 40, 'WONK' 1, 'opsz' 120` | `--step-4` |
| Surface title | `'SOFT' 40, 'WONK' 1, 'opsz' 72` | `--step-3` |
| Prose `h1` | `'SOFT' 40, 'WONK' 1, 'opsz' 60` | `--step-3` |
| Section / panel title | `'SOFT' 30, 'WONK' 1, 'opsz' 40` | `--step-2` |
| Recommendation name | `'SOFT' 30, 'WONK' 1, 'opsz' 36` | `--step-2` |
| Entry title | `'SOFT' 25, 'WONK' 1, 'opsz' 24` | `--step-1` |
| Strapline (display, not heading) | `'SOFT' 20, 'WONK' 0` | `--step-1` |
| Viability figure | `'SOFT' 10, 'WONK' 0, 'opsz' 30` | `--step-2` |

The global `h1,h2,h3` fallback is `'SOFT' 30, 'WONK' 1`.

**Rule — the figure is flatter than the title.** The viability number is set at
`SOFT 10, WONK 0` while an entry title at nearly the same size is `SOFT 25,
WONK 1`. Figures are printed data and must not wobble; titles may.

### Label register

The uppercase agate label is one repeated object, not a per-surface invention:
`--step--2`, `text-transform: uppercase`, `--font-text`, `--ink-faint`, and one of
three tracking values by loudness — `0.06em` (foot, flags), `0.1em` (nav, figure
labels), `0.14em` (block titles, section heads).

---

## 3. Space

| Token | Value |
| --- | --- |
| `--space-1` | `0.25rem` |
| `--space-2` | `0.5rem` |
| `--space-3` | `0.875rem` |
| `--space-4` | `1.375rem` |
| `--space-5` | `2.25rem` |
| `--space-6` | `3.5rem` |

A ~1.6 ratio throughout. Used unmodified: `--space-5` is the sheet's horizontal
padding and the masthead's block padding on every surface; `--space-6` is the
sheet foot and the bottom of every sheet; `--space-4` steps that down below
`48rem`.

The only place the scale is departed from is the weighted stock row, which
computes padding from data (§5).

---

## 4. Construction

### The sheet on the press bed

Every one of the eight surfaces is built from the same four declarations, with
only the measure changing:

```
max-width: <measure>;  margin: 0 auto;  padding: 0 0 var(--space-6);
background-color: var(--paper);  background-image: <tooth>;
min-height: 100dvh;  box-shadow: 0 2px 24px rgba(36,29,22,0.16);
```

The sheet is trimmed at its own edges and never bleeds to the browser's. The
shadow is a soft drop that lifts paper off a press bed — it is not an offset
block shadow, and this world does not use one.

**Measures, by what the surface holds:**

| Measure | Surfaces |
| --- | --- |
| `var(--sheet-max)` = `1240px` | Subjects, inbox, topic, subject |
| `68rem` | Curriculum |
| `62rem` | Lesson, refresher, the reading |
| `52rem` | Sow a subject |
| `30rem` | Entry |

The entry sheet is the narrowest in the build because it holds one field
pair, and it is the one surface with no running head: until the door opens
there is nowhere else to go, and a nav printing four sheets that all redirect
back is a dead end dressed as a menu.

**Rule — the measure is set by reading load, not by hierarchy.** A reading
surface is narrower than a listing surface; a single form is narrowest.

The graph is the one exception: `100dvh`, `overflow: hidden`, on `--paper`
directly. The bed is not a sheet.

### The masthead band

Repeated on all eight surfaces without variation in structure:

1. A **saturated plate band** — `background: var(--plate-green)`, `color:
   var(--paper)`, `padding: var(--space-5)`.
2. The **running head** (`SheetNav`) printed *inside* the band, so navigation is
   part of the sheet rather than a floating toolbar.
3. The title, at `--step-3` (`--step-4` on home), `line-height` 0.9–0.95,
   `letter-spacing` −0.02 to −0.03em.
4. A **5px mustard rule** directly beneath the band (`.headRule`), then
   `margin-bottom: var(--space-5)`.

Two authorised departures, both data-driven:

- **Curriculum** takes `--plate-ultramarine` — the route is a different kind of
  document from the stock it describes.
- **Topic** takes its subject's own plate colour inline
  (`style={{ background: colour }}`), so the sheet is printed in the ink of the
  thing it is about.

The graph substitutes a control strip in the same material: `--plate-green`
with a `4px solid var(--plate-mustard)` bottom border.

**Rule — the running head carries sheets, and one thing that is not a sheet.**
Four sheets (the bed, marked, tend, inbox), then *Write an entry* behind a
`1px rgba(239,231,214,0.35)` rule. Sowing is not among them — it is something
you do, offered on the subjects sheet where the decision is made — and the
subjects sheet does not print itself. Leaving is not among them either: it is
one press on a single-user app, and it sits at the foot of the subjects sheet.

**Rule — reversed-out text on a plate band uses paper at alpha, never a
different hue.** `rgba(239,231,214, 0.7 / 0.75 / 0.85 / 0.88 / 0.9)` covers every
case in the build. `0.7` is the quietest label, `0.9` is an active link.

### The filed-under line

Topic, curriculum, and lesson print a parentage line above the title: `--step--2`,
uppercase, `0.14em` tracking, `rgba(239,231,214,0.7)`. It carries live data —
the subject a topic is filed under, or the subject-and-topic a lesson sits
inside — and its segments are links. It exists to answer "where am I in the
four-layer map", not to decorate the title.

**Rule — this line is a breadcrumb or it is not printed.** It must resolve to
real parents from the data. A surface with no parent (refresher) uses
`.eyebrowless` and prints no line at all rather than inventing one.

**Rule — one component prints it, and the descent reads left to right.**
`components/Crumbs` is the trail on every sheet that has ancestors: Subject ›
Topic on a lesson, Subject on a topic. A reader who learns to read it on one
sheet must not have to learn it again on the next, so no surface prints its own.
The separator is `›` rather than ` · ` — a middot is a list, and these are not
siblings — and it is **drawn by the stylesheet on a wrapper around each link**,
never written between them and never on the anchor's own `::before`: inside the
anchor it would be underlined with the link, selected with its text, and read
out as part of its name. The trail takes `font: inherit` and `color: inherit`
from the eyebrow it stands in, so the same component prints in the green of a
lesson head and in a subject's own plate without knowing either colour. The rule
under each crumb is `color-mix`ed to 45% of that inherited ink, so a trail reads
as a trail rather than as a row of buttons.

The curriculum is **not** a step on a lesson's trail. That sheet is being phased
out, and a route drafted from a topic takes the topic's own name in any case, so
printing both read "Brokerage Accounts and Custody › Brokerage Accounts and
Custody".

### The running head

`SheetNav` gives every surface the same sheets — Subjects, The bed, Library,
Marked, Tend, Inbox, Sow — plus an optional back link. The first is named for
what it lists rather than for the catalogue metaphor: *Stock list* was a word
the reader had to learn before it told them anything. Two rules the component enforces:

- **The sheet you are on is stated, not offered.** The current sheet renders as a
  `<span>` in `--plate-mustard` with `aria-current="page"`, not as a link.
- **No link is printed twice.** A back link pointing at the same href as a sheet
  link removes the sheet link.
- **Leaving is set apart by a rule, not by a colour.** The sign-out control
  sits with the sheets at the same size and tracking, divided from them by a
  `1px solid rgba(239,231,214,0.35)` left border which is dropped below
  `40rem`. It is the one navigation that leaves, and the catalogue is private,
  so every surface carries it.

### Rules and borders

`border-radius: 0` everywhere, including form fields and the scrollbar thumb.
Nothing in this world is rounded.

| Weight | Use |
| --- | --- |
| `1px solid var(--rule)` | Row separators, block-title underlines, plate outlines. |
| `1px dotted var(--rule)` | Leader dots; the mobile figure divider. |
| `1px solid var(--rule-strong)` | Section heads, the margin's left edge, form fields. |
| `2px solid var(--rule-strong)` | Sheet foot; panel edges; the margin's top edge when stacked. |
| `2px solid var(--plate-mustard)` | The underline that marks an action link. |
| `5px var(--plate-mustard)` | The head rule. |

**Rule — an action is a link with a mustard underline, not a button shape.**
`.recommendationAction`, `.workNext`, and the nav back link are all text with
`border-bottom: 2px solid var(--plate-mustard)`. Filled buttons exist only where
the action commits something (`.tend`, the inbox action): `--plate-green` fill,
paper text, square, hovering to `--plate-terracotta`.

### The fixed tree

The subject sheet prints its bed as an outline, nested by `specialises` first
and `prereq` second, and by nothing else — `related` and `alternative` are
sideways and nest nothing. Nesting is drawn with rules rather than indentation
alone: a `1px solid var(--rule)` down the branch and a `var(--space-3)` tick
out to each entry.

**Rule — the outline is fixed and the graph is not.** A topic takes at most one
parent, the strongest single relationship wins, and the whole tree is a pure
function of the data, so the same data prints the same way twice. This is the
whole reason the sheet exists beside the canvas: the graph is where position is
emergent, which is good for shape and useless for finding the same topic again.
Adding and removing topics therefore belongs on this sheet, not on the bed.

**Rule — the outline's order answers "what now", its nesting answers "under
what".** Siblings at every depth sort by attention first — a route being worked
rises above one recently tended, which rises above the rest — then simpler-first
by the mean stage of their lessons, then by title as the final tie-break
(`orderSubjectOutline`, `src/lib/outline.ts`). The nesting `buildTopicTree` drew
is never touched: a branch keeps its subtree when it floats, and the generic
tree stays title-sorted for every other caller. The earlier build sorted
siblings by title alone; the order now carries where to look, not just where a
topic is filed, and it stays deterministic — the three keys are all read off the
data, so the same bed still prints the same way twice.

### The spread

The home surface is a two-column spread: `minmax(0, 1fr) 20rem` with
`gap: var(--space-6)`, the margin `position: sticky; top: var(--space-4)` and a
`1px solid var(--rule-strong)` left edge. Below `60rem` it collapses to one
column and the margin's left border becomes a `2px` top border.

**Rule — when the margin stacks, it keeps its rule and changes its side.** A
margin that loses its rule stops being a margin.

### Loose stock, folded behind one entry

The subjects sheet does not list loose topics. Under the stock list, a
second section head — `.sectionHead` and `.sectionTitle`, the *Subjects* head
again — reads *Loose stock*, and under it a single `.entry` leads to `/loose`.
The entry is set exactly as a holding: a plate (a specimen on
`--plate-terracotta`, the loose sheet's own band), its size and padding
weighted by the unfiled count against the largest bed, the name in the display
face, and in the figures column one label, *Total*, over the count where a
subject prints *Viability* and *Condition*.

**Rule — a job is offered as one door, not glanced at as a list.** A list of
bare names on the stock sheet grew with whatever was unfiled and pushed
everything under it down the page, while doing nothing about any of them. The
count says how big the job is; the sheet behind it is where it gets done. The
separate head is what stops the entry being read as one more bed.

### Fertile ground, under the stock list

Material that was read, put topics in the ground, and matched no subject
already sown. Each entry is a row set against a
`2px solid var(--plate-mustard)` left edge with `var(--space-2)` of padding
inside it:

```
.fertileRow {
  padding-left: var(--space-2);
  border-left: 2px solid var(--plate-mustard);
}
```

**Rule — a proposal is set as a row.** Fertile ground is a small case
being made, with the title of the thing read, what it turned out to be
about, and the one action that answers it, so it takes a full-width row and
the mustard edge the sheet already uses to mean *this is where the work is*.

### An errand folded away

The inbox holds two errands that are not the same errand: reading what is
waiting, and tidying up after it — folding duplicates together, throwing a
thing away. The second lives in a `<details>` at the foot, above a
`1px solid var(--rule)`, its summary in the label register (`--step--2`,
`0.14em`, uppercase, `--ink-faint`).

**Rule — a destructive action is never printed beside the thing it would
destroy.** *Remove* on every row is a mis-press waiting to happen on a sheet
whose ordinary press is *Done with it*. Folded away, the reader has said
what errand they are on before they are shown the way to do it. A resource
with exposures behind it prints *read into the record — kept* instead of an
action, because the row cannot be deleted without rewriting the log the
figures are built on, and offering an action that fails at the server is
worse than saying so.

**Rule — a filter earns its place at eight rows.** The search box and kind
buttons print only above eight resources. Below that they are furniture over
a list the reader can already see all of.

### Two specimens, set side by side

The adjudication queue asks the one question in the app that cannot be undone:
whether two topics are the same thing. It used to ask it over two names and,
where one happened to exist, one description. That is not enough to answer
with, so the two are now set out as a pair of plates.

| Part | Treatment |
| --- | --- |
| The pair | One column under `42rem`, two from `42rem`. Read down on a phone, compared across on a desk. |
| A plate | `--paper-deep`, `--space-3` padding, a `3px` left rule: `--plate-mustard` for the one that has just arrived, `--plate-green` for the one already on the map. |
| A missing description | Said in `--ink-faint` italic — *No description — there is only the name to go on* — never left as a gap. |
| What it holds | The beds it sits in, in the label register; then its counts; then up to three of the resources it was drawn from, leadered with an em dash. |
| The counsel | One line about *these two*, at `--step--1` in `--ink`, under both plates. |
| A failed decision | `--plate-terracotta` behind a `3px` rule of the same ink, at the head of the queue. |

**Rule — the two sides are told apart by ink, never by position alone.** On a
phone one is above the other and position says nothing.

**Rule — a gap is never left where a fact is missing.** An absent line cannot
be told from one that failed to load, and *there is only the name to go on* is
the most useful thing the plate can say about that topic.

**Rule — the sheet may raise a question and may never settle one.** The counsel
line names the asymmetry — a bare name against a topic with history, or two
topics that have both been read — and never says *merge them*. The same rule
the resolver and the sort are held to.

### Filing, stated on the topic

A topic sits under every subject it genuinely belongs to. The block that says
so, and the only place it can be changed, is in the topic sheet's margin.

| Part | Treatment |
| --- | --- |
| A filing | The subject's name, parted by `1px solid var(--rule)`, with its actions in the label register at the right. |
| The home stamp | *home* in the label register, `--paper` on `--ink-soft`, `1px var(--space-2)` — stamped, never coloured. |
| The settling stamp | *settling* in the same register, outlined in `1px solid var(--rule)` on the sheet's own paper — filed, but the bed has not yet been asked what it sits under. |
| *Take out* | Set apart from *Make home* by a `1px solid var(--rule)` on its left, as removal is everywhere else in the build. |
| The picker | A `--paper-deep` select on `1px solid var(--paper-edge)`, then *File it here too* and *Move it here* as outlined controls in the label register. |
| Its level | *Make it a subject* and *Fold it into a topic*, in the same outlined register, in a block of their own below. |
| A reckoning | `--paper-deep` behind a `3px` `--plate-terracotta` rule: what a fold would move, before it can be pressed. |

**Rule — the margin's controls are outlined, not the sheet's ink button.** Two
ink buttons side by side in a column that narrow read as a dialog, which this
world does not have.

**Rule — a filing is confirmed at once and reconciled behind.** The placement
that follows it is a model call over the whole bed, and the decision was made
when the button was pressed. The subject appears in the list immediately under
a *settling* stamp and the reader can leave; a failure puts the list back as it
was and says what went wrong. A spinner would say neither which half happened
nor when to stop watching.

**Rule — a control that will be refused says so before it is pressed, and
never disappears.** A topic carrying a route cannot change level, and the block
prints that sentence where the two buttons would be. A missing control reads as
a fault, and *why can I not do this* is the question a hidden one provokes.

**Rule — what cannot be undone is costed first.** Folding a topic into another
is two presses, and the second is only offered once the sheet can state what
the first would move — the same shape the bed's own grubbing-out uses, in the
same terracotta.

### Loose stock

The one sheet in the catalogue that is not organised by subject, because it is
the list of things that have none. Its band is `--plate-terracotta`: what is on
it is unresolved rather than kept.

| Part | Treatment |
| --- | --- |
| The band | `--plate-terracotta` under the mustard `5px` rule, the standfirst counting what is loose. |
| A row | A checkbox, then the name in the display face with a dotted leader out to its viability figure — the stock entry the whole catalogue is set in. |
| What it holds | The counts in the label register, then up to three sources leadered with an em dash. |
| The handful | `--paper-deep` behind a `3px` terracotta rule, holding the file-under picker, the note about placement, and the throw-away. |
| The reckoning | Full width above its own press, never beside it. |
| A refusal | The reason in `--ink-faint` italic, in place of the control it replaces. |

**Rule — a bulk action states what it has *not* done.** Filing thirty topics
does not place them, because that is thirty model calls; the sheet says so and
names *Draw connections*, which asks once for the whole bed, rather than
letting the reader think the job is finished.

**Rule — a delete is costed in the aggregate, not per row.** The question a
handful asks is what the fourteen hold *between* them, so the reckoning sums
them (`core/loose.reckon`) and says plainly whether any of it has been read.
Resources are summed rather than deduplicated: that overstates a handful drawn
from one article, which is the honest direction to be wrong in above a delete.

---

## 5. Encoding State

This is the load-bearing part of the system. `PRODUCT.md` states that colour
alone may never encode ability or freshness. The build honours it on both
channels, and the rules below exist to keep that true.

### Ability → a printed viability percentage

Computed as `Math.round(((ability - 1) / 4) * 100)`, floored at 0, and **printed
as a number** at `--step-2` in Fraunces, `tabular-nums lining-nums`.

**Rule — a low-confidence figure prints as a guess.** When
`ability_confidence < 0.4`:

- the figure is prefixed with the word **"about"**,
- it is set `font-style: italic`,
- it is dropped to `opacity: 0.62` (stock list) / `0.6` (graph panel),
- and a caveat paragraph is printed beside it, ruled with a
  `2px solid var(--plate-mustard)` left border: *"Not much to go on yet — this
  figure is a guess."*

This is PRODUCT principle 4 made material: vagueness is visible, not hidden.

### Why this figure → a slip unrolled from the figures

On the topic sheet, *Viability* and *Condition* in the band are the controls
that explain them. Each label carries a dotted underline in paper at `0.45`,
firming to full paper on hover and while open; the figure beside it is
unchanged. Either one unrolls the same slip, and pressing it again, pressing
anywhere else, or Escape rolls it back up.

| Part | Treatment |
| --- | --- |
| The slip | The sheet's paper and tooth, the margin block's `2px solid var(--rule-strong)` head rule, `1px` at its foot, and the soft sheet drop. Starts under the band's mustard rule, at the figures' left edge, `34rem` wide, trimmed at the sheet's edges; its own scroll past `min(70vh, 36rem)`. |
| The standing | Both figures in one line of `--ink-soft`, with the date last tended. |
| A line | The reason, what it moved, and the date. What it moved is signed and in points — `+6` in `--plate-green` at `600`, `±0` and *moved nothing* in `--ink-faint` italic, *made it a guess* in `--plate-terracotta`. On a phone the date drops under the reason, tighter to it than to the next line. |
| The key | One faint italic line under a dotted rule saying the numbers are points and that the same work is worth less the more of it there is. |

**Rule — every number explains itself where it is printed.** The account was a
margin block a column and a screen away from the figure it accounted for. It
is now one press on the figure.

**Rule — an impact is the log replayed, never an estimate.** Each line is
`computeAbility` on the log up to and including it, minus the one before
(`core/figureRecord`), so the lines add up to the figure from the floor. A
struggle moves no points and is printed as what it did: it made the figure a
guess.

**Rule — something the reader did here is listed even when it moved nothing.**
A diary entry filed under or naming the topic whose reading recorded nothing
is still printed, quoted, as *moved nothing*. A record that silently leaves
out what the reader wrote reads as the entry having been lost.

Still not a modal: nothing is dimmed and nothing is trapped (see the composer).

### Freshness → hatch density, plus a word, plus a label

`StockBar` renders an SVG bar whose **hatch density** carries state. Fill length
is `max(0.06, freshness) * width`, so a live-but-cold holding never renders as
nothing.

| State | Threshold | Hatch (gap / width / angle) |
| --- | --- | --- |
| `in-season` | `freshness >= 0.6` | 2 / 2 / 45° — solid |
| `holding` | `freshness >= 0.25` | 4 / 1.5 / 45° — ruled |
| `dormant` | below `0.25` | 7 / 1 / 45° — sparse |
| `unsown` | `lastExposureAt === null` | none — an empty bed with only its outline |

**Rule — `unsown` is not `dormant`.** Never sown and gone cold are different
facts about the map, and PRODUCT's "honest over flattering" principle depends on
the distinction. `unsown` is reached by a null check *before* any threshold is
read, and it renders as an outline with no fill at all.

**Rule — three carriers, always.** Every condition displays (1) hatch density,
(2) the printed state word from `STOCK_LABEL` — "In season", "Holding",
"Dormant", "Unsown" — and (3) an `aria-label` reading
`"{state}, viability {n} per cent"`. Removing any one of the three is a
regression, not a simplification. Colour inside the bar is the subject's plate
ink and is the *fourth*, redundant, carrier.

### Holding size → row weight

`--weight` (0–1, from topic count) drives two things on the stock row at once:

```
--plate-size: calc(2.75rem + var(--weight) * 2.5rem);
padding: calc(var(--space-2) + var(--weight) * 2.75rem) var(--space-2);
```

**Rule — a bigger holding takes more of the sheet.** Plate size and row height
move together, so the shape of the listing is readable before any figure is.
On phones this is dropped: `--plate-size` is pinned to `3rem` and padding to
`var(--space-4)`, because at 390px a weighted row reads as a layout accident.

### A self-reported level → a specimen that grows

The roots gauge (`RootsGauge`) is the one place the user states a figure
rather than the app inferring one, and it is the only device in the build whose
drawing changes with its value. A 0–5 slider sits beside a plate: at 0 a
dormant seed on bare ground, and at each notch the seed splits, the taproot
deepens, the stem rises, a leaf pair opens, and at 5 the crown flowers.

Growth is drawn on rather than faded in. The stem and taproot are one path
each with `pathLength={1}` and `strokeDasharray="1"`; the notch sets
`strokeDashoffset`, so the line travels the way a root travels. Laterals,
leaves and the crown scale from their own attachment point, delayed by the
notch they belong to, so the figure grows base-first and retracts in one
movement.

**Rule — the plate carries the same three carriers as every other state in
this world.** The notch number, the stage name in words ("Bare ground",
"Seedling", "In full flower"), and the drawing. The slider carries
`aria-valuetext` with both the number and the name; the plate carries the same
as its `aria-label`. Colour carries nothing here on its own — the whole plate
is one ink.

**Rule — depth is drawn, not implied.** Roots below the soil line are set a
shade back from the shoot (`rgba(239,231,214,0.82)` against solid paper) and
run against three dotted strata, because the question asks how *deep* the
roots go and a shoot alone cannot answer it.

### Two figures compared → the same plant at two depths

The reading sets the user's own roots figure against the app's reading of
their answers, and it does it by printing `RootsSpecimen` twice at the same
size in the subject's own ink. Only the depth of the plant differs, so the
difference is the only thing that reads. Each plate carries its number, the
stage name, and a label saying whose figure it is.

**Rule — the verdict is derived from the two numbers, never asked for.**
`readVerdict` compares them in code, so the sentence above the plates can
never disagree with the figures beside it. One rung is inside the noise of a
single conversation and is called "matching"; a difference is only named at
two.

**Rule — what was shown and what was not are marked, not coloured.** Held
ground takes a solid `2px` green rule before it, missing ground a `2px`
dotted terracotta one. The mark is the carrier and the colour is redundant,
as everywhere else in this world.

### Subject plates

`Emblem` prints a **solid colour field with the specimen reversed out in paper** —
a flat 60×60 field, one silhouette, no gradients, no strokes, no line art
floating on the ground. Forms are seeds and specimens (sprout, bulb, trellis,
graft, grain head, aperture), not category icons. Unknown subjects fall back to
an unsprouted seed.

**Rule — plates are reversed, not drawn.** A line drawing on the paper ground is
the antiques-shop memory of this world; the saturated field is the world itself.

**Rule — forms must read at 48px.** Thin strokes and small internal detail are
excluded by construction; interior marks are cut back to the plate's own ink via
`.plateGround`.

### Route progress → a printed chip, and the same specimen grown

A third channel, beside ability (the viability figure) and freshness (the
condition hatch). Those say how well a topic is held and how warm it is; this
says how far the deliberate route through it has been *worked*. It is derived
from the topic's curricula and their lessons, never stored, so it can never
disagree with the lessons printed under it (`routeProgress`, `src/lib/progress.ts`).

Five states, worked-least first: **No route**, **Route drafted** (a proposal
counts for nothing until approved, so it never reads as started however many
lessons are marked), **Not started**, **In progress**, **Worked**.

**Rule — the chip carries the word, and the mark and colour are redundant.** On a
bed row the state prints as an agate label with a small tick beside it: the tick
is hollow where there is no route or none is worked and solid once it is, and the
colour runs faint → terracotta → ink-soft → mustard → green across the five
states. Removing the word is the regression; the tick and the colour only make it
quicker to read, exactly as the condition bar's three carriers do.

**Rule — where a band has the room, the roots specimen is grown to the same
figure.** `RouteSpecimen` (`src/components/RouteSpecimen.tsx`) draws the sow
sheet's own `RootsSpecimen` at a level mapped from progress — bare ground with no
route, a seedling part way, in full flower when every lesson is done — reversed
out of the band as an inset window, on the subject, topic and curriculum
mastheads. The subject band folds its topics' routes into one figure
(`aggregateRoutes`); the curriculum band is the cleanest, since lessons-worked
there is unambiguous.

**Rule — the growing specimen is one drawing with two meanings, so its caption
names which.** The plant is the sow sheet's self-reported roots gauge and the
band's route-progress plate both. To keep them apart the band passes an explicit
`ariaLabel` ("Route progress: 3 of 8 worked") and prints a progress caption
rather than a roots stage name — never "Seedling" where the figure means lessons.
The drawing is shared; the words are not.


### The bench → work in hand, at the foot of every sheet

Sowing a subject and writing a lesson each take the better part of a minute.
Both were held by the sheet that started them, so walking off to read something
else orphaned the request: the row was written and the reader was never told.
A third job now runs here too, and it is the odd one: opening a freshly sown
bed — a route through its most introductory topic, then that route's first
lesson — which nobody pressed a button for and which runs for a couple of
minutes.

**Rule — the notice's one job while it runs is to say that leaving is safe.**
"Carry on reading — you will be told when the bed is laid." A reader who does
not know they can walk away will sit and watch, which is the thing the bench
exists to stop.

**Rule — a mark, never a bar.** No job here can honestly say how far along it
is, and a bar that cannot know its total lies about how much is left. The mark
breathes, which says *working* without claiming progress.

**Rule — it docks at the foot, and it is polite.** The head of every sheet is
its masthead — the plate that says where you are — and a notice over that
covers the one thing the reader navigated to see. `aria-live="polite"`: a bed
finishing must not interrupt someone mid-sentence in a lesson.

**Rule — a notice carrying a way to what it made waits to be followed or
dismissed.** Only one with nowhere to go puts itself away on a timer. Taking a
link away from a reader who walked off *because the page told them they could*
is the one thing this mechanism must never do. A failure stays for the same
reason: it is the only place the reason is written down.

**Rule — the state's ink runs down the near edge**, mustard while it works,
green when it lands, terracotta when it fails — and the notice takes the only
drop shadow in the catalogue, because it is a slip of paper laid on the sheet
rather than something printed on it.

**Rule — a running job says only what it knows.** Writing a lesson happens in
rounds this app drives, so it can honestly report the round and the words down.
Sowing is one request with nothing reporting out of it, so it gets the sowing
sheet's own `LABOURS` — a gardener's rumour of a step, never dressed as a
measurement. Opening a bed is both in turn: `OPENINGS` while the route is being
drafted, because that is one request too, and then the lesson's own rounds. None
of them ever gets a bar: a bar that cannot know its total lies about how much is
left.

**Rule — work the app started itself reports once, at the end.** Every other
notice answers a press. Opening a bed does not: it begins the moment a bed is
laid, and a reader who sowed a subject did not ask for a route or a lesson. So
it says what is underway and then says one thing — *your first lesson in X is
ready* — with the way to it. The route it drafted on the way is a step, not
news, and a second notice for it would turn a helpful thing into a thing that
talks. It names the topic and never the lesson: nobody has seen that lesson's
name, and a notice naming it would be a notice about a stranger.

**Rule — an offer is not a job, and does not look like one.** The bench also
carries notices that *ask* — the next lesson is unwritten, shall I start it —
in ultramarine rather than any of the three working inks, so it never reads as
work that has gone wrong. It is offered half way through the reading, not on
open: opening a lesson is not evidence anyone will read it, and it goes in the
corner rather than into the prose, because an offer set into the middle of a
lesson is an interruption.

### A model the reader can push on

`chart` plots figures the writer already had. `model` computes them, from
sliders the reader drags: what a rate rise does to a repayment, what doubling
a contribution does to a pot. The difference is what it can teach — a plotted
line shows one case, and the *shape of a response* is a thing you find by
moving a number and watching.

**Rule — the controls are above the plot.** They are the question; the plot is
the answer. Two sliders to a row where there is room and one where there is
not, never narrower than about ten characters, or the control cannot be dragged
with any precision.

**Rule — the slider is drawn, not inherited.** Rail in the sheet's own rule,
thumb a mustard plate with an ink edge, on both engines' pseudo-elements. The
one control a reader actually drives must not be the one thing on the sheet
drawn by the operating system.

**Rule — a figure that has no answer prints an em dash and says why.** The
arithmetic runs out at the ends of some sliders (a payment formula divides by
the rate, so a rate of nought has no answer in it). A line quietly missing its
first point is exactly the kind of thing that spends the reader's trust in
every other figure on the sheet, so the gap is stated in terracotta under the
plot.

**Rule — the payload stays data.** The formulas are read by `core/expression`,
a closed arithmetic grammar: numbers, the names the block declared, five
operators and eleven functions. No property access, no call but a whitelisted
one, no globals, no strings. A lesson body is downstream of ingested web pages,
so a formula is never only the model's own idea; `eval` would have traded away
the whole reason blocks are safe.

### Lesson standing → the same stamp, one level down

What the route chip does for a topic on a bed, the standing stamp does for a
lesson on a topic sheet. The sheet used to print a small *worked* against the
lessons that were finished and nothing at all against the rest, so the one
surface where the work actually happens was the one that had to be read line by
line to find out where you were.

Five states, worked-least first, derived from the lesson rather than stored
(`lessonState`, `packages/core/src/lessonState.ts`): **Not written** (no body
yet; opening it writes it), **Ready** (written and waiting), **Opened** (the
reader has been in it), **Started** (passages marked in it), **Worked**.

**Rule — the ladder is the route chip's ladder.** Dashed faint outline →
ink-soft outline → mustard outline → filled mustard → filled green, the same
progression in the same inks as `No route → … → Worked` on a bed row. These are
the same question asked one level down; a reader who has learned the bed must
not have to learn this. The word carries it, the tick (`○ ◐ ●`) and the colour
repeat it.

**Rule — the mustard arrives as a rule before it arrives as a ground.** *Opened*
is the step between *Ready* and *Started*, so it takes the plate as an outline
and leaves the two filled stamps as the two that mean work happened. Its ink is
`--ink` rather than `--ink-soft`: having been somewhere is a fact about the
reader, not a property of the lesson.

**Rule — being in a lesson and working in one are different things, and the
sheet says which.** *Opened* is recorded on the first open and never moved
(`036`, `opened_at`); *Started* still rests on marks. Collapsing the two would
have made the word cheaper rather than the record truer — a reader deciding
where to go back to wants to know whether they did anything there.

**Rule — *Up next* is a pointer, not a fifth state.** The first unworked lesson
in the route carries it, in the sheet's own ink rather than a plate colour, and
the row takes the hover's mustard edge and holds it. It is what answers "where
am I", and it answers from position and completion, which are exact — opening a
lesson and wandering off is not progress through a route, and neither is marking
a passage in one. A draft route has no next: nothing counts until it is
approved.

**Rule — a lesson that is not written offers to be written, under its own row.**
Two presses, the same as a rewrite, because it is a minute of compute that
cannot be taken back. The control sits under the row rather than inside it: a
button inside an anchor is not a thing a browser or a screen reader can make
sense of.
---

## 6. The Graph

Same world, different substrate: WebGL through Sigma with a live ForceAtlas2
worker.

**Encoding:**

- **Size = ability.** `5 + ability * 2.4`.
- **Fill = freshness, mixed toward paper.** `fade(subjectColour, 0.3 + freshness * 0.7)`
  interpolates the plate hex toward `#efe7d6`. A dormant seed sits back into the
  bed rather than disappearing; the floor of `0.3` guarantees it never reaches
  the ground.
- **Hue = home subject's plate ink**, with `#7d6f5d` for unfiled.
- **Edges are printed rules, not hairlines:** `rgba(90,76,56,0.62)`, sized
  `0.9 + weight * 1.4`. The comment records why — the earlier lighter value
  vanished on a sunlit phone screen.

**Rule — a dormant seed's label recedes with it.** `defaultDrawNodeLabel` sets
label fill to `#8a7d68` below `freshness < 0.25` and `#241d16` above. A faded dot
with black text beside it reads as two things; the entry must read as one state.

**Rule — labels flip side rather than clip.** When `x + gap + width` exceeds the
canvas width, the label is drawn to the left of its seed. This is what makes the
bed legible on a phone, which PRODUCT requires.

**Rule — membership pulls but does not print.** Topics sharing a subject get a
ring of edges at `size: 0.4`, `rgba(90,76,56,0.10)`, existing only so the physics
cluster by subject. Most topics carry no stated relationship, and force layout can
only group what is connected.

**Rule — settle before first paint.** 400 one-shot iterations
(`gravity: 1.2, scalingRatio: 24, slowDown: 14`) run before the renderer opens, so
the bed is readable immediately rather than animating out of a seeded ring. The
running worker then uses deliberately different values (`gravity: 0.05,
scalingRatio: 80, slowDown: 40`) — continuous iteration with the settling values
collapses the bed into a clump.

**Rule — a held seed is pinned, and the bed settles around where it is dropped.**
`fixed` for the duration of the drag, released after, worker stopped 2500ms later.

The graph panel is a right rail at `min(24rem, 100%)` on desktop and a bottom
sheet at `max-height: 72dvh` below `40rem` — a 24rem rail would cover the whole
bed on a phone.

---

## 7. Motion

Recorded as it is, which is no longer nothing: **29 `@keyframes` across 17
stylesheets**, all built on three duration tokens and two curves.

| Token | Value | What it is for |
| --- | --- | --- |
| `--dur-feedback` | `140ms` | A control acknowledging a pointer. Colour, border, opacity. |
| `--dur-state` | `300ms` | Something changing what it is: a panel opening, an arrow travelling. |
| `--dur-settle` | `620ms` | A surface arriving. Sheet and band entrances, staggered rows. |
| `--ease-settle` | `cubic-bezier(0.16, 1, 0.3, 1)` | Everything arriving. Exponential ease-out, from an already-visible default. |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | The few things that leave. |

**Rule — one authored moment per surface, and the rest is feedback.** A sheet
settles in (`sheetIn`) and its masthead band arrives with it (`bandIn`); after
that the surface is still, and every other transition is a control answering a
pointer at `--dur-feedback`. Where rows are staggered they carry a `--i` index
and lean on the same curve, so a list arrives as one gesture rather than
seventeen.

**Rule — a surface with an entrance animation needs an explicit stacking
order.** An element being transformed paints in the same pass as a positioned
one, so on the sowing sheet a later field painted straight over the book lookup
list hanging out of an earlier one, and the matches came out with the form
showing through them. `.questions .field` therefore carries `position: relative;
z-index: calc(20 - var(--i))` — the same `--i` that staggers the animation
orders the painting. Any surface that animates fields in and floats anything out
of one needs the same treatment.

**Rule — waiting moves, and the movement is never the information.** The galley
(§4) inks up line by line and its ellipsis comes up in turn, but the *shape* of
the galley is what tells the reader what is coming. Stop every animation on the
page and the shape remains, which is the test for whether a loading state was
designed or decorated — and the test is the design's to pass, not a media
query's to answer.

**`prefers-reduced-motion` is not honoured, deliberately and everywhere.** This
is a single-user app whose owner asked for motion regardless of the OS setting:
there is no global guard, and no surface guards its own animation either.
Everything spatial still runs through `--motion-travel`, so restoring it is one
block — recorded in `globals.css`, where it would go — and that block belongs
back the moment anyone else uses this.

---

## 8. Reading and Marking

What belongs to a lesson rather than to a listing, added after the first eight
sections were written and extended since.

### Contents

A lesson opens with what it is made of: a ruled band at the head of the sheet,
set in the label register, in two columns where there is room for them.

| Part | Treatment |
| --- | --- |
| Band | `1px solid var(--rule)` top and bottom, `--space-3` padding, `--space-5` clear beneath. Not a sidebar. |
| Label | The label register (§2): `--step--2`, `600`, `0.1em`, uppercase, `--ink-faint`. |
| Entry | `--step--1` at `1.4`, `break-inside: avoid` in a two-column run with a `--space-5` gutter. One column below `40rem`. |
| Subsection | Stepped in `--space-3` and set in `--ink-faint`, so the shape of the lesson reads at a glance. |
| Entry at rest / hover | No rule; `1px` bottom border in `--plate-mustard` on hover. |
| Landing | `scroll-margin-top: var(--space-5)` on every prose heading, so a section arrives under the top of the window rather than jammed against it. |

**Rule — the list and the sections it names are one reading.** The headings are
parsed out of the markdown through the same block-stripping the renderer does,
and the ids stamped on the rendered headings come from that same list in that
same order. Two sections of one name are numbered apart rather than left to
collide. Nothing is derived twice, so the list and the page cannot disagree.

**Rule — a contents list shorter than two entries is not a contents list.**
Below that it is longer than what it lists, and it is not printed.

### Lesson blocks

A lesson body is markdown, and markdown turns anything that is really a shape or
a question into a paragraph about one. Six blocks answer that: `chart`, `check`,
`compare`, `steps`, `flow` and `picture`. Each is a fenced region whose body is
JSON, lifted out before the markdown is parsed.

**Rule — a block reads values, never markup.** The payload is written by a
model, so it never reaches the HTML pipeline: a component we wrote decides how
the numbers are drawn. Nothing in `src/components/blocks/` uses
`dangerouslySetInnerHTML`, and a payload too broken to draw returns `null`
rather than taking the lesson with it.

| Part | Treatment |
| --- | --- |
| Block ground | `--paper-deep` on a `1px solid var(--paper-edge)` edge, `--space-4` padding, `--space-5` clear above and below. |
| Block title | `--step-1`, `'SOFT' 25, 'WONK' 1` — an entry title, not a section head. |
| Chart inks | The plate palette in order: green, terracotta, mustard, ultramarine. Series colour is identity, never mood. |
| Chart axes | `11px` `--font-text`, `--ink-soft` for ticks, `--ink-faint` uppercase for axis labels. |
| Check accent | `2px` left rule in `--plate-green`, the house weight for an aside (§4). |
| Right / wrong | `--plate-green` / `--plate-terracotta`, each carrying a mark as well as a colour. |

**Rule — every plot ships its figures.** A `<details>` table under each chart
carries the numbers, tabular and right-aligned, so the data survives a screen
reader, a printer, and anyone who would rather read it than a picture of it.

**Rule — a plot scrolls rather than compresses.** `min-width: 22rem` inside an
`overflow-x: auto` wrapper. Below that width a chart is a smear.

| Part | Treatment |
| --- | --- |
| Flow step | A `--paper` box on a `1px` rule with a `3px` left tab in `--plate-green`, `max-width: 26rem`, centred, joined to the next by a `1px` rule down the middle. |
| A step that parts | The same box with a `--plate-mustard` tab: the catalogue's colour for a decision to be made. |
| Branch lanes | Side by side under a `1px` rule, each headed by its label in the label register. Stacked below `40rem`. |
| Picture | Printed like a plate: `--paper` ground, `1px solid var(--paper-edge)`, `max-height: 60vh` with `object-fit: contain`. Credit under it in the label register, linked to where it lives. |

**Rule — a flow is drawn in the sheet's furniture, not as a picture of a
flowchart.** Boxes, rules and lanes, because a lane that stacks on a phone still
reads as a flow and an SVG of routed arrows does not. A branch that leads
somewhere else in the flow *says where it goes* rather than dragging a line
across the drawing to get there.

**Rule — a picture is pointed at, never kept.** Nothing is uploaded, copied,
cached or optimised: optimising it would mean fetching it through this app,
which is hosting it by another name. Two consequences are designed for rather
than hidden. The picture may not be there — a model cannot check a link — so a
picture that will not load is not an error state: the block prints what the
picture was of, keeps the caption that said the thing the picture was there to
say, and links out for anyone who wants to try. And fetching it tells its host
that somebody is reading; the request goes out `referrerPolicy="no-referrer"`,
so the host learns that a browser asked, not which page asked. A picture with no
`alt` is not drawn at all.

### Marks

A kept passage is drawn back onto the prose it came from, by walking the
rendered text nodes — never by threading markup past the sanitiser.

| Part | Treatment |
| --- | --- |
| Wash | `linear-gradient` from transparent to `rgba(200,135,26,0.26)` at `0.15em`, so the ink sits *under* the words rather than boxing them. |
| Hover | The same wash at `0.42`. |
| Carrying a note | `inset 0 -2px 0 var(--plate-mustard)` as well as the wash. |
| Focus | The app's one focus treatment: `2px solid var(--plate-terracotta)`, offset `2px`. |

**Rule — a mark is stated twice, in wash and in rule.** A noted mark and a bare
one must not differ only by how dark the wash is; the underscore is what carries
the difference on a dim screen and under reduced colour vision.

**Rule — a mark that cannot be found is not drawn, and the count says so.** The
quote is stored verbatim rather than as an offset, because a lesson body is
regenerable. When a rewritten body no longer contains the words, the sheet
prints `n no longer in this text` rather than a count that disagrees with the
page.

**Rule — a passage is drawn a piece per element, and reads as one mark.** A
reader marking two dot points, or a sentence that carries on into the next
paragraph, makes a selection that crosses an element boundary, and the DOM
refuses to wrap a range like that in one go. So each element's share is wrapped
separately, under the same id: the wash breaks where the list breaks, the
whitespace between items is left alone, the passage counts once, and pressing
any piece opens the one mark. Only the first piece is a tab stop, and no piece
is hidden from a screen reader — that would take the words with it.

**Rule — a mark with no passage is a note on the lesson, and says so.** It is a
mark like any other — same topic, same search, same weight — with nothing to
draw it back onto. Everywhere marks are printed, an empty quote prints
`A note on this lesson` in the label register rather than an empty blockquote
with a mustard rule down the side of it.

### Mathematics

A lesson on logarithms is mostly notation, so TeX between `$` and `$$` is
typeset rather than printed. It is set as **MathML**, by the browser, in whatever
it has for a maths face.

| Part | Treatment |
| --- | --- |
| In a sentence | `font-size: 1.05em` — the browser's maths default runs a shade large beside this body size, and notation inside a sentence should read as part of it. |
| On its own line | `math[display='block']`, with `--space-4` above and below: the air a paragraph gets. |
| Too wide | `overflow-x: auto` on the equation alone, with `--space-1` under it for the bar. |
| The source | The `<annotation>` carrying the TeX is `display: none`, stated rather than assumed. |

**Rule — a line inside a block is formatted like the prose around it.** A block's
shape is this app's, but its text is written by the same hand that wrote the
sentence above it, and carries the same emphasis and the same notation. Block
fields are rendered inline through a shorter allowlist than the prose gets —
emphasis, code and mathematics — with no headings, no lists and no links, because
those are a model breaking the furniture rather than formatting a line.

**Rule — a formula is set, or it is printed as typed; it is never dropped.** A
model writes TeX it has not compiled, so some of it will not compile. A hole
where an equation should be teaches less than the equation as the writer typed
it, so a formula KaTeX refuses is printed verbatim, delimiters and all.

**Rule — a formula wears the catalogue's ink, not its own.** The allowlist admits
no attribute that can hold a colour, a background or a style, and KaTeX is given
no trust — `\href`, `\url` and `\includegraphics` are refused at the source. A
formula is notation; it is not a way into the page.

**Rule — an equation scrolls; the sheet does not.** A long derivation on a phone
is the one thing here that cannot be made to wrap, and a page that scrolls
sideways is a broken page (§8). The scroll belongs to the equation.

### Tended passages, and the card

The sentence a card came out of is drawn back onto its own lesson, by the same
engine that draws a mark and for the same reason: both store their words rather
than an offset into a body that is regenerable.

| Part | Treatment |
| --- | --- |
| Rule | `inset 0 -2px 0 rgba(107,53,80,0.55)` — a plum rule *under* the words, drawn inside the box so it cannot reflow the line when the cards land a beat after the prose. |
| Hover | The rule at full `--plate-plum`, plus a `0.08` plum ground. |
| Focus | `2px solid var(--plate-plum)`, offset `2px` — the plate's own, because this plate is what the whole garden wears. |
| The card | Plum 5px left edge on `--paper-deep`; the kind and then the concept in the label register above, the answer in plum when it is shown. |
| The back | A `--paper-edge` rule above it; the answer, then the reason, then the concept's gist in `--ink-faint`, each less specific than the last. |
| The blank | `min-width: 5em`, transparent text, `2px` plum underline. |
| The verdict | `--font-display` at `--step-2`; `--plate-green` for *True*, `--plate-terracotta` for *False*, the word itself always written out. |

**Rule — a card wears its kind before its concept.** A card is one of three
things — a sentence with a blank in it, a question and its answer, or a
statement to judge — and the eyebrow says which first and the concept second.
A reader about to answer needs to know whether they are recalling a term,
producing a definition or judging a claim; working it out from the shape of the
sentence is a beat of confusion at exactly the wrong moment.

**Rule — the three kinds differ in the question and in nothing else.** The
plum rule, the reading-size type, *Show it*, the four rungs and the quiet row
underneath are identical across all three. What changes between them is one
line of front and one block of back. A reader meeting a true-or-false after a
cloze is meeting a different question, never a different instrument.

**Rule — a blank is a term, not a clause.** One to three words, and five is the
refusal (`BLANK_WORDS_MAX`); the model that writes them is held to four. A hole
any wider is a sentence to reproduce from memory, which nobody can grade
themselves on having recalled, and it is precisely what the old verbatim cards
produced: *pays for the physical length of that path* is a paraphrase, not an
answer.

**Rule — a verdict carries its reason, always.** A true-or-false prints one
line saying why, under the word, and the card cannot be written without it. A
statement judged false with no correction leaves the reader knowing they were
wrong and not knowing what is right, which is a card that costs attention and
teaches nothing.

**Rule — the wash follows the anchor, not the card.** A card no longer has to
quote its lesson to exist; it has to quote it to be *drawn* in it. Where the
model can honestly name the sentence a card came out of, that sentence is
checked against the body character for character and is what the plum lands on.
A card with no anchor is answered on the Tend sheet or under the lesson and is
simply not in the prose — which is already what happened to any card whose
lesson had been written again beneath it. What the plum means is unchanged:
*the garden is holding on to this sentence*.

**Rule — the two layers carry differently, so a sentence can be both.** A mark is
a mustard wash *behind* the text from the baseline down; a tended passage is a
plum rule *under* it. A sentence that is marked and tended reads as washed and
underscored, not as a muddy third colour, and neither layer is styled against
the other — an override would make the appearance depend on which painter ran
last, which is exactly what the two are arranged not to depend on.

**Rule — a selection is offered its verbs, and presumes neither.** *Add mark*
and *Make a cloze* float beside the words, the same size and weight, separated by
`--space-1`: keeping a passage and asking it back later are different judgements
and neither is the default. Nothing opens until one is pressed, on a mouse as
well as a finger.

**Rule — each verb wears the ink of the thing it makes.** Ink on mustard for the
mark, because a mark is a mustard wash everywhere it appears; paper on plum for
the cloze, because the whole garden is plum. The colour is a fact about the
outcome, not decoration, and it tells the pair apart before either is read.
Mustard is the ground and never the text — as a text colour it is the pairing
that fails, which is why the inbox tally stamps it the same way round.

**Rule — furniture over a live selection is padded to the labels and no
further.** The pins float over a sentence the reader is still choosing, so every
millimetre of padding covers the page and widens what a thumb can hit by
accident. Horizontal padding is `--space-3`, the least the labels allow. The
2.5rem height is *not* cut with it: that is what the thumb is aiming at, and it
is already at the floor.

**Rule — the tended layer never takes a selection over.** Marking is select the
words and let go. A press that ends a selection does not open a card; only a
press with nothing selected does. Nothing about the plum changes the words'
position, size or weight, so a passage under it selects exactly as the prose
either side of it does.

**Rule — the blank is a fixed rule, never the answer greyed out and never a gap
its own width.** The length of a blank is a hint, and a hint nobody asked for.
The answer is not in the document at all until *Show it* is pressed.

**Rule — the concept's gist is on the back, always.** It was above the question,
on the reasoning that an answer should be recalled from something rather than
guessed from nothing. But a gist belongs to the *concept*, and a concept carries
two to four cards: one sentence cannot be written to avoid all of their answers,
so sooner or later it hands one over — *"Jank is a stutter that happens when the
work needed to produce a frame overruns the ~16.7ms budget"*, above a card asking
what the frame budget is. Printing it only when it happens not to leak would be
worse, because absence is information: a reader who notices it missing has been
told the answer is in the sentence they are not being shown. So it moves for
every card, and becomes what it is good at — the lesson's own words about the
concept, read once the answer is in. What orients the reader beforehand is the
concept's **name**, which is a heading rather than a claim.

**Rule — nothing on the face of a card may contain its back.** Not the question,
not the sentence around a blank, not the nudge, and not the concept name printed
above it. A card that can be read off is graded *Easy* — honestly, because it
genuinely was — and the scheduler then files it away for four months on the
strength of a reading. One crib does more damage than ten missing cards, which is
why a card that trips this is dropped rather than repaired. A true-or-false is
exempt: its back is one of two words, and a statement containing *true* has not
thereby revealed that it is true.

**Rule — an answer is final on the press, and confirms nothing.** The card goes
the moment a rung is pressed and the next rises into its place; the write happens
behind the reader. There is nothing to confirm afterwards — the wait the answer
buys was on the button before it was pressed, which is the only moment it could
change what the reader does, and a card that lingers while a request goes out
invites a second press on a question already answered. A write that fails says so
in a sentence under the deck and does not drag the card back: the schedule was
never moved, so the card is still due.

**Rule — the sitting is dealt, not loaded.** Two edges sit behind the card while
more than one is left, and each card rises from just below with a hair of scale.
This is the only motion on the sheet; everything else here is type. It says
*another card* rather than *the page changed*, and it answers without a number
the question a reader has mid-sitting — is there much more of this. All of it
runs through `--motion-travel`, so reduced motion keeps the fade and flattens the
deck to a single card rather than leaving edges that promise a movement nobody
asked to see.

**Rule — a sitting is shuffled, never dealt in the order it was planted.** The
queue is *chosen* oldest-first, because an overdue card is the one the schedule
is most wrong about, and then shuffled before it is dealt. Cards planted
together were read together: answered in that order, each one is answered with
the one before it still in mind, which is a run-on rather than a recall, and
every *Easy* it earns is a lie the scheduler then reasons from for a fortnight.

**Rule — an answer states its consequence, not an adjective.** The four answers
carry the wait each would give — on a card being met for the first time,
*Gone · 10 min*, *A struggle · 1 d*, *Got it · 3 d*, *Easy · 15 d*, and all four
growing as the card is held — computed on the page from the same pure scheduler
the server will run. The four are the same size and weight: none of them is the
right answer, and the labels say what happened rather than grading the reader.
A miss carries a terracotta left edge as a second carrier behind the word, never
instead of it — and only the miss, because it is the one answer that is not a
recall.

**Rule — the answers are a grid, and never leave an orphan.** Four buttons in a
wrapping flex row break to three and one the moment the card is narrow, and a
lone fourth button under three reads as the odd one out — the wrong thing to say
about a rung that is neither best nor worst. `repeat(auto-fit, minmax(8.5rem,
1fr))` takes four columns on the Tend sheet and two by two in the panel the
reading opens. Below 40rem it is two by two, with the label and the wait on one
line: a mis-tap here schedules a card wrongly for a year, and four stacked rows
would push the last answer below the fold of a card the reader already scrolled
past the passage to reach.

### Tend this lesson

The garden at the foot of the reading: a sitting over one lesson's cards, the
whole deck listed, and a way to ask for more. It stands between the prose and
*How did you go?*, which is the order the two things happen in — you finish
reading, you find out whether it stuck, and then you say honestly how you
worked through it.

| Part | Treatment |
| --- | --- |
| The section | A `--paper-edge` rule above, `--space-5` of air under it, `--space-6` clear of the prose. |
| Heading | `--font-display` at `--step-1`, in `--plate-plum`. |
| Standing | One line at `--step--1` in `--ink-faint`, on the same baseline: *12 cards, 3 due*. |
| Start a sitting | The one outlined control: `1px solid var(--plate-plum)`, plum on paper, inverting on hover. |
| The rest | Underlined quiet actions in `--ink-faint`, going plum on hover. |
| A list row | Three columns — the kind in the label register, the front clipped to one line, when it is next wanted, right-aligned. Hairline between rows. |
| A card that cribs | *Reads off*, in `--plate-terracotta`, beside the kind. A word rather than a dot: a coloured mark with no text has to be learnt before it means anything. |

**Rule — it is quiet, and it is not a second ending.** A rule, a heading at
section size and one line of standing. Everything else is folded away until it
is asked for. A reader who came to the bottom of a lesson for the prose should
be able to pass this without deciding anything.

**Rule — one card at a time here too, but the deck may be a list.** The sitting
is the Tend sheet's instrument unchanged, down to the same component. The
inventory is a list, and can be, because it is a thing to *fix* rather than a
queue to work: nobody feels behind for owning thirty cards, they feel behind
for being shown thirty questions at once.

**Rule — an old card that cribs is marked, not deleted.** Nothing written
since 047 can give away its own answer. Cards planted before it were held to no
such rule, and throwing one away — a card the reader may have been answering for
months — is not a correction the app gets to make unasked. So the list says
*reads off* against it, in the one place the whole deck can be read over, and
leaves rewriting or pulling it up to the reader.

**Rule — a list row prints the front and never the back.** A cloze's blank is
drawn as a short rule in the row exactly as it is on the card. A deck listed
with its answers showing is a deck that teaches itself by being read, which is
the one thing a deck must not do.

**Rule — a row opens into the whole card, not into its own controls.** Pressing
a row replaces it with the card, which already carries *Edit* and *Pull up*. A
second set of controls written into the list would be a second set that could
come to disagree with the first about what pulling a card up means.

**Rule — writing more adds, and the button says so.** *Write some more*, never
*regenerate*. Generation hands the model every question the lesson already asks
and keeps what it writes that is new; nothing standing is deleted. A card the
reader has been answering for three months carries the only evidence of what
they hold, and no improvement to a prompt is worth it.

**Rule — a sitting with nothing due offers the deck anyway.** *Turn one over
anyway* draws the whole lesson shuffled. A reader who has just finished the
prose and wants to be asked about it is not asking the scheduler's permission;
answering early costs them only the schedule they chose to skip.

### Making a mark

The furniture that puts a mark on the page: what offers to keep a passage, and
where the panel that keeps it stands.

| Part | Treatment |
| --- | --- |
| The offer | `Add mark`, in the label register on `--plate-green`, `min-height: 2.5rem`, `0 4px 14px rgba(36,29,22,0.3)`. Placed below the selection: the phone draws its own callout above one. |
| The note button | `2.75rem` square on `--plate-green`, hovering to `--plate-terracotta`, riding the sheet's right edge on a zero-height `position: sticky` line at `bottom: var(--space-5)`. |
| The opener | `2rem` square, quiet until hovered, at the head of any panel. Four corners pointing out, or the same four pointing in. |

| Panel state | Where it stands |
| --- | --- |
| Against the passage | Measured from the selection, below it unless the window would cut the panel off, held inside the sheet horizontally. |
| Docked | Across the foot of the screen below `40rem`; at the corner of the window above it (`inset: auto var(--space-5) var(--space-5) auto`). Every panel on a phone, and at any width the panel that was opened against nothing. |
| Open out | A page of its own: `inset: 0 0 0 auto` at `--notes-width` (`min(28rem, 42vw)`), full height, beside the reading. Below `40rem` there is no beside, so it takes all but the top `12dvh`. |

**Rule — nothing opens on its own under a finger.** A phone selects by
long-press and then hands the reader pins to widen the selection with, and
dragging those pins sends the page no events at all. A panel that opened on the
first settled selection took the passage over while it was still one word long.
Touch gets the offer floated beside the selection instead, and the selection
stays the reader's until they take it. A mouse still opens the panel on the
release, because a release is a decision.

**Rule — anything measured against the window hangs off the body.** Every sheet
arrives under an animation on `main` (§7), and an animation that touches
`transform` leaves `main` the containing block for everything fixed inside it —
so a docked panel came to rest at the foot of the article rather than the foot
of the screen. The offer, the docked panel and the opened-out notes are
therefore rendered into `document.body`. A panel measured against the prose is
not: it belongs to the sheet it was measured in. The note button is sticky
rather than fixed for the same reason from the other side — sticky is not caught
by the transform, and needs no measuring.

**Rule — a maximised note is beside the reading, not over it.** The sheet gives
up the strip the notes stand in (`body[data-notes='open']` takes
`padding-right: var(--notes-width)`), rather than being covered by them. That is
the difference between a panel over the page and a notebook open next to it, and
it is stated on the body because the reading is `main` and cannot narrow itself.
The width is one token, so the column and the room made for it cannot drift
apart.

### The marks beside the reading

The index to the page: everything marked in this lesson, down the side of it,
in the order the lesson reads. It stands in the same column as a note opened
out, at the same width and on the same ground.

| Part | Treatment |
| --- | --- |
| Column | `inset: 0 0 0 auto` at `--notes-width`, full height, `1px solid var(--rule-strong)` on the left. It arrives on `--dur-state`; the head is fixed and the rows scroll under it. |
| Head | `Marked here` in the label register, the count set beside it as a figure in the display face — a tally, not more label. |
| Row | `--space-3` all round, parted by `1px solid var(--rule)`. |
| The passage | A control set as what it is: the `2px` mustard left rule of a marked passage, in `--ink-soft`, going to `--ink` under the pointer. |
| Remove | Set apart from the benign actions by a rule rather than a colour, as on the marked sheet. |
| The way in | The tally under the reading, which is already the sentence a reader looks at when they wonder what they marked; and a quieter twin of the note button on the sheet's edge, stamped with how many. |

**Rule — the order is the lesson's, not the reader's.** A list sorted by when each
mark was kept is a list in the order someone wandered through the text, which is
no order at all a week later. `paintMarks` says where each mark landed on the
page, and that is what the list is sorted by. Anything not drawn — a note on the
lesson, a passage whose words have been rewritten away — keeps the order it
arrived in and follows.

**Rule — one strip of the window, one thing standing in it.** A note opened out
and the list want the same column. The panel takes it and the list yields until
it closes, rather than the two drawing over each other.

**Rule — a mark is on the page it was taken from, so pressing one travels
there.** The list is an index, not a second copy: pressing a passage scrolls the
lesson to it and the mark says which of the words on the page was the one asked
for, twice, and then it is an ordinary mark again. On a phone the list is over
the reading, so it puts itself away first.

**Rule — a finger asks for it with a swipe, and the swipe stays out of the
way.** Right to left over the reading opens it, left to right sends it back. It
is ignored on anything that scrolls sideways of its own accord — a plot, a wide
table — while a selection is being made, while a panel is open, and when the
travel is more down the page than across it.

### The note editor

A box you can bold things in, at every size the panel takes.

| Part | Treatment |
| --- | --- |
| Field | `--paper-deep` on `1px solid var(--paper-edge)`; `2px solid var(--plate-green)` inset on `focus-within`. The house field. |
| Controls | `2rem` minimum, parted from the writing by nothing but their own row. `B` and `I` in the display face; both lists drawn, never set as glyphs. |
| A mark the cursor stands in | `--plate-green` ground, `--paper` glyph — pressed, in the ink of the sheet rather than a colour of its own. |
| The writing | `1rem`, flat: below 16px a phone zooms the page to meet the field and leaves the reader scrolled away from what they were marking. |
| Opened out | The box takes the height the controls and the buttons leave, and scrolls on its own. The panel never scrolls; the writing does. |

**Rule — the box shows the note as it will read.** What is typed is drawn in the
box with the same marks, spacing and list indents it will carry on the lesson,
the topic sheet and the marked sheet. There is no preview, because there is
nothing to preview.

**Rule — a note is kept as markdown, not as what the box produced.** The search
column indexes the note verbatim, and a note kept as HTML fills that index with
its own tags. Keeping it as text also means one pipeline renders both a lesson
and a note, and that every note written before the editor existed is already
valid markdown with nothing to migrate.

**Rule — a note is allowed less than a lesson.** The same sanitiser, a much
shorter allowlist: emphasis, lists, links, code. No headings and no tables — a
remark that needs an `<h2>` is a lesson.

**Rule — a paste is taken as words.** The clipboard arrives as `text/plain`,
because a paste out of another page carries its styling, its links and whatever
else was in it.

### The galley

What a sheet shows while it waits. Type being set: ruled slugs at the measure
and rhythm the real prose will take, in `--paper-deep` and `--paper-edge` —
the same stock as the page, without the ink on it yet.

| Shape | Where |
| --- | --- |
| `prose` | A lesson or a refresher: heading slugs and ragged line lengths. |
| `rows` | A route: a numbered run, the shape a curriculum actually takes. |
| `panel` | The graph, floated on the drill grid, because the bed is not a sheet. |

**Rule — a waiting state states its shape, not its progress.** The galley says
what is coming and roughly how much of it; it never fakes a percentage it
cannot know.

---

### The timeline, drawn as a plate

The Marked sheet holds one date-ordered stream of two kinds of thing: passages
kept while reading, and diary entries written about a week. They are the same
history, so they are printed on one spine — and the spine is **drawn**, not
ruled. The sheet is a botanical plate: one stem down the page, the days as
stations on it, every row hanging off it as a specimen.

| Part | Treatment |
| --- | --- |
| The stem | Two hairlines `1px` apart — `1px solid var(--rule-strong)` on the left, `1px solid var(--rule)` on the right — running the length of the list inside a `2.5rem` gutter (`1.9rem` under `30rem`). |
| A day station | A `1.4rem` disc on the stem: `--paper` ground, `1px solid var(--rule-strong)` ring, a `--rule-strong` centre inset `4px`. The date in the label register beside it, then a `1px` rule running out to the day's tally. |
| A specimen | The row's form in a `24` box, on a `--paper` ground so the stem does not run through the drawing, in its strand's plate ink. |
| The tendril | A `1px var(--rule)` hairline from the specimen out to the text it labels. |
| Folded | The row's own opening words — `MARK_CLIP` 150 characters for a mark, `ENTRY_CLIP` 240 for an entry — with *Open* in the label register at the right. The whole line is the control. |
| A passage, folded | Set in the display face at `'SOFT' 20, 'WONK' 0, 'opsz' 20`, `--ink`: it is someone else's sentence and is set as one. |
| An open entry | `--paper-deep` on a `2px` left rule in `--plate-plum`, `--space-3` padding. |
| Open them all | An outlined control in the label register beside the count, `1px solid var(--rule)`. |

**Rule — the three forms are what the rows are, not decoration.** A leaf for a
passage that was kept (`--plate-olive`), a bud for a note of your own
(`--plate-mustard`), the thing in flower for an entry about a week
(`--plate-plum`). The forms say what a row is before a word of it is read, so
the shape of a month can be seen at arm's length: long runs of leaves where a
lot was read, a flower where a week was thought about, bare stem where nothing
happened. The geometry is in `core/specimens.STRAND_GLYPHS` for the reason the
rest of the drawn forms are: the same mark must not grow a different form on
each platform.

**Rule — the summary is the row's own words, clipped.** Never a description of
them, and never generated. This sheet is a record of what someone chose to
keep, and a précis would be the app talking over them. The ellipsis is written
into the text rather than drawn with a gradient — this world has no gradients as
colour.

**Rule — a row with nothing folded away gets no control that opens it.** A
toggle that opens onto the same sentence teaches the reader that the toggles are
not worth pressing, which costs more than the tidiness of having one on every
row.

**Rule — an entry is set apart by its ground, not by a card.** A mark is a
sentence and an entry is a page; the difference is carried by the deeper paper
the catalogue already uses for a block, so the stem still reads straight down
the sheet.

**Rule — today and yesterday are named; everything else is dated.** Those are
the two days a reader locates by memory rather than by number. The year is
printed only when it is not the current one. Days are local, never UTC: a UTC
boundary files a third of someone's evenings under tomorrow.

### Writing an entry

The one control in the catalogue that appears on every sheet and is not a way
to another sheet.

| Part | Treatment |
| --- | --- |
| The control | In the masthead band with the sheets, set apart by `1px solid rgba(239,231,214,0.35)` on its left — the treatment leaving already carries. Paper at `0.82`, full paper when open. |
| Open state | Stated in full-strength paper at `600`, as the current sheet is. |
| The composer | The sheet's own paper and tooth, at the sheet's measure, positioned from the measured foot of the masthead band. `1px solid var(--rule-strong)` at its foot. |
| Motion | One unroll, `--dur-settle` on `--ease-settle`, spatial through `--motion-travel`. |

**Rule — a control that acts rather than navigates is set apart by a rule, not
by a colour or a size.** Leaving and writing are the two, and they wear the
same treatment.

**Rule — the composer is not a modal, because this world has none.** It unrolls
under the band on the sheet's own paper. Nothing is dimmed, nothing is trapped,
the page carries on existing underneath, and Escape rolls it back up.

**Rule — the panel is trimmed at the sheet's edges, never the browser's.** It is
centred at `var(--sheet-max)` like every sheet in the build; a panel running the
full width of the window would be the one thing here that bleeds.

**Rule — the mustard rule belongs to the band.** The composer is ruled off in
`--rule-strong`: a second mustard rule a few pixels under the band's own reads
as a printing fault.

**Rule — a field's size is what the sheet says about how much is wanted.** The
entry box is half again the height of a note box (`6.75rem` against `4.5rem`),
because a note is a remark about a sentence and an entry is a page about a week.

**Rule — a tag the reader did not type is stated where they can see it.** An
entry opened from a topic sheet starts filed under that topic, and the composer
stamps *Filed under* with the name, on `--paper-deep` behind a `2px` plum rule.
A tag nobody can see is a tag nobody can correct. It is a fact, not a control:
naming something else with `@` is how it is changed.

### Naming something with `@`

| Part | Treatment |
| --- | --- |
| The menu | `--paper` on `1px solid var(--rule-strong)`, one `3px` hard shadow. |
| What is being typed | A header on `--paper-deep` over a `1px solid var(--rule-strong)`: the `@` in `--plate-terracotta` at `700`, the name in `--ink` at `600`. Does not scroll with the list. |
| Nothing matched | *Nothing by that name yet.* in `--ink-faint`, in place of the list. |

**Rule — the menu prints what it is filtering against.** The name is typed into
the prose the menu covers, so without this the reader is filtering a list
against something they cannot see and cannot tell a typo from a topic they do
not have.

**Rule — the menu stays up while a name is being typed.** It used to close the
moment nothing matched, which took it away exactly when it was most needed.

## 9. Browser Surfaces

The chrome carries the design rather than defaulting:

- `::selection` — `--plate-mustard` ground, `--paper` text.
- `:focus-visible` — `2px solid var(--plate-terracotta)`, offset `2px`. One
  focus treatment for the whole app.
- Scrollbars — `scrollbar-width: thin`, thumb `--rule` on transparent track,
  `border-radius: 0`, with a `3px solid var(--paper)` inset border on WebKit.
- Links at rest — `text-decoration-color: var(--rule)`, `1px` thick,
  `0.22em` offset; hovering to `--plate-terracotta`.
- A lesson named in prose that is not on the map — `--ink-faint`, and the
  rule under it broken (`underline dotted var(--rule)`) rather than solid.
  Printed with no `href`, so it is neither pressable nor in the tab order,
  and carries a `title` saying there is no lesson for it yet.

**Rule — a name in a note is a link, and looks like one.** `@` in a note
names a topic or a lesson, and what is kept is a markdown link to that
thing's own address. So it is set apart from a link out of the catalogue by
where it points rather than by a class: `--plate-green` ink and underline
against the terracotta a link out carries, hovering to terracotta like
everything else. The `@` the reader typed stays in the words, which is what
makes it read as a tag; the colour only says it goes somewhere inside.

**Rule — a link to nothing keeps its words and loses its way.** A lesson
links out to the lessons around it, and a body outlives the rows near it: a
route is reshaped, a lesson is grubbed out, and a link that reached
something in March reaches nothing in June. The sentence was built on those
words, so the words stay and print — what goes is the way anywhere. Three
carriers, none of them load-bearing alone: faint ink, a broken rule, and
the title.

---

## 10. Responsive

Four breakpoints, each with a stated reason:

| Breakpoint | What changes |
| --- | --- |
| `60rem` | The spread collapses to one column; the margin unsticks and moves its rule to the top. |
| `48rem` | Sheet body padding steps `--space-5` → `--space-4`. |
| `40rem` | The stock row stops being a table row and becomes a stacked card; leader dots are dropped; the graph panel becomes a bottom sheet; the graph canvas inset grows to `7.5rem` for the wrapped control strip; the loose sheet goes single-column; the contents list goes single-column; every mark panel docks across the foot of the screen; an opened-out note takes all but the top `12dvh` instead of standing beside the reading; and the marks list comes in off the right edge over the reading at `min(22rem, 86vw)`, leaving a strip of the lesson showing behind it. |

**Rule — below 40rem a table row becomes a card, it does not shrink.** The
three-column grid cannot survive 390px without wrapping titles into their own
figure column. Plate and name take one line; figures are ruled off beneath with a
`1px dotted` divider.

---

## 11. Known Ceilings

Recorded because the document is a description, not a defence.

- **A mark is found by its words, not by an offset.** §8. A lesson body is
  regenerable, so a rewritten one can leave a kept passage undrawable; the
  sheet says how many rather than pretending. A passage that crosses an
  element boundary *is* drawn — in pieces, under one id — but one whose words
  have changed is still lost, and the words are matched with whitespace
  collapsed, so a passage the reader marked across a paragraph and the list
  under it matches on a single space.
- **The graph camera does not fit to content.** `renderer.getCamera().animatedReset()`
  restores Sigma's default camera rather than computing the planting's bounding
  box, so beds can sit off-centre when the layout spreads them unevenly. Named as
  a `ponytail:` comment in `GraphCanvas.tsx`.
- **The note editor is driven by `document.execCommand`.** Deprecated for years
  and implemented by every browser, because the alternative is writing a text
  editor. For four commands over a paragraph or two it is the right amount of
  machinery, and `NoteEditor.tsx` is the only thing that would have to change
  if it ever goes.
- **A break inside a note becomes a paragraph.** Markdown's own hard break is
  two trailing spaces, which no editor preserves and no reader can see, so the
  serialiser parts paragraphs instead of keeping a line break the note cannot
  say.
- **A picture in a lesson is somebody else's, and may not be there.** §8. The
  writing agent is told to write the paragraph instead where it is not sure the
  address is real, but it cannot check one, and a link that worked in March can
  be gone in June. The block is built to fail readably rather than to promise
  the picture will hold.
- **The bed draws the newest 500 marks and no more.** A reader who marks
  freely has thousands, and past a point they stop being a layer over the
  planting and become the planting. The rest are on the marked sheet, where
  they are searched rather than laid out. Named as `MARKS_ON_THE_BED`.
- **A lesson names its neighbours, and cannot check them.** A body is
  written once and cached on the row; the map under it goes on moving. The
  names are resolved every time the lesson is read rather than frozen in
  when it was written, which is what lets a link that has stopped reaching
  anything say so — but nothing goes back and mends the prose around it, so
  a sentence can end up leaning on a stub. The same ceiling as the picture
  block, for the same reason: written from a map the writer cannot re-check.
- **No dark mode**, by construction. See §1.
- **No reduced-motion guard**, by decision rather than by oversight. See §7.
- **Screenshots in `.impeccable/review/` are stale** — they predate several
  surfaces and the rename of clusters/nodes to subjects/topics. The code is
  authoritative.

---

## 12. Not the System

Recorded so future surfaces do not inherit them:

- **Any one-off value in a single surface stylesheet.** The tokens in §1–§3 are
  the system; a bespoke `rem` measure used once is a local decision.
- **The specific plate assigned to any one subject.** Subject colour is data,
  and the plate palette is the system, not the mapping.
- **Fixed pixel measures on the stock row.** They are computed from `--weight`;
  copying a resulting value freezes data into layout.
