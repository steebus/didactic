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
| `var(--sheet-max)` = `1240px` | Stock list, inbox, topic, subject |
| `68rem` | Curriculum |
| `62rem` | Lesson, refresher |
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

**Rule — reversed-out text on a plate band uses paper at alpha, never a
different hue.** `rgba(239,231,214, 0.7 / 0.75 / 0.85 / 0.88 / 0.9)` covers every
case in the build. `0.7` is the quietest label, `0.9` is an active link.

### The filed-under line

Topic, curriculum, and lesson print a parentage line above the title: `--step--2`,
uppercase, `0.14em` tracking, `rgba(239,231,214,0.7)`. It carries live data —
the subject names a topic is filed under, or the topic-and-curriculum a lesson
sits inside — and its segments are links joined by ` · `. It exists to answer
"where am I in the four-layer map", not to decorate the title.

**Rule — this line is a breadcrumb or it is not printed.** It must resolve to
real parents from the data. A surface with no parent (refresher) uses
`.eyebrowless` and prints no line at all rather than inventing one.

### The running head

`SheetNav` gives every surface the same four sheets — Stock list, The bed,
Inbox, Sow — plus an optional back link. Two rules the component enforces:

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

**Rule — the outline is fixed and the graph is not.** Siblings sort by title
at every depth, a topic takes at most one parent, and the strongest single
relationship wins with ties broken by title, so the same data prints the same
way twice. This is the whole reason the sheet exists beside the canvas: the
graph is where position is emergent, which is good for shape and useless for
finding the same topic again. Adding and removing topics therefore belongs on
this sheet, not on the bed.

### The spread

The home surface is a two-column spread: `minmax(0, 1fr) 20rem` with
`gap: var(--space-6)`, the margin `position: sticky; top: var(--space-4)` and a
`1px solid var(--rule-strong)` left edge. Below `60rem` it collapses to one
column and the margin's left border becomes a `2px` top border.

**Rule — when the margin stacks, it keeps its rule and changes its side.** A
margin that loses its rule stops being a margin.

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

## 7. Motion — recorded as it is

**The build has essentially no motion system.** The complete inventory:

| Where | Declaration |
| --- | --- |
| Stock list row hover | `transition: background-color 140ms ease-out` |
| Sow-subject control hover | `transition: background-color 140ms ease-out` |
| Inbox action hover | `transition: background-color 120ms ease-out, color 120ms ease-out` |

There are **zero `@keyframes` in the codebase**. There is no entrance, no state
transition, no authored moment on any surface. Every other hover in the build —
and there are many — snaps.

What is genuinely systematic today is only this: **hover feedback is a
background-colour change of 120–140ms `ease-out`, and nothing else moves.** The
graph's physics is simulation, not authored motion.

`prefers-reduced-motion: reduce` is honoured globally in `globals.css`, clamping
all animation and transition duration to `0.01ms`.

This section describes a floor, not an intention. An animation pass follows this
document; when it lands, this section is replaced by what that pass actually
ships, not by what it hopes to.

---

## 8. Browser Surfaces

The chrome carries the design rather than defaulting:

- `::selection` — `--plate-mustard` ground, `--paper` text.
- `:focus-visible` — `2px solid var(--plate-terracotta)`, offset `2px`. One
  focus treatment for the whole app.
- Scrollbars — `scrollbar-width: thin`, thumb `--rule` on transparent track,
  `border-radius: 0`, with a `3px solid var(--paper)` inset border on WebKit.
- Links at rest — `text-decoration-color: var(--rule)`, `1px` thick,
  `0.22em` offset; hovering to `--plate-terracotta`.

---

## 9. Responsive

Four breakpoints, each with a stated reason:

| Breakpoint | What changes |
| --- | --- |
| `60rem` | The spread collapses to one column; the margin unsticks and moves its rule to the top. |
| `48rem` | Sheet body padding steps `--space-5` → `--space-4`. |
| `40rem` | The stock row stops being a table row and becomes a stacked card; leader dots are dropped; the graph panel becomes a bottom sheet; the graph canvas inset grows to `7.5rem` for the wrapped control strip; loose stock goes single-column. |

**Rule — below 40rem a table row becomes a card, it does not shrink.** The
three-column grid cannot survive 390px without wrapping titles into their own
figure column. Plate and name take one line; figures are ruled off beneath with a
`1px dotted` divider.

---

## 10. Known Ceilings

Recorded because the document is a description, not a defence.

- **No authored motion.** §7. The system today is three background-colour
  transitions.
- **The graph camera does not fit to content.** `renderer.getCamera().animatedReset()`
  restores Sigma's default camera rather than computing the planting's bounding
  box, so beds can sit off-centre when the layout spreads them unevenly. Named as
  a `ponytail:` comment in `GraphCanvas.tsx`.
- **No dark mode**, by construction. See §1.
- **Screenshots in `.impeccable/review/` are stale** — they predate several
  surfaces and the rename of clusters/nodes to subjects/topics. The code is
  authoritative.

---

## 11. Not the System

Recorded so future surfaces do not inherit them:

- **Any one-off value in a single surface stylesheet.** The tokens in §1–§3 are
  the system; a bespoke `rem` measure used once is a local decision.
- **The specific plate assigned to any one subject.** Subject colour is data,
  and the plate palette is the system, not the mapping.
- **Fixed pixel measures on the stock row.** They are computed from `--weight`;
  copying a resulting value freezes data into layout.
