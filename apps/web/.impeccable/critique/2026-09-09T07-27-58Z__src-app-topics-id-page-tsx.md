---
target: didactic UX review
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:D:\\_projects\\didactic\\src\\app\\topics\\[id]\\page.tsx"
target_fingerprint: "sha256:678cccd18004161e956da090d66ea430f6a818a510a6c7e7496209c2386c429c"
target_path: "D:\\_projects\\didactic\\src\\app\\topics\\[id]\\page.tsx"
timestamp: 2026-09-09T07-27-58Z
slug: src-app-topics-id-page-tsx
---
Method: dual-agent (A: design review · B: detector + browser evidence)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | The 60s sowing wait cycles 12 labels every 31.2s, so the user watches it loop and reads it as hung. No galley on the one surface that most needs one. |
| 2 | Match System / Real World | 3 | The catalogue vocabulary is self-teaching and does real semantic work. Docked for "FORCES" and "5 done with", which are implementation vocabulary. |
| 3 | User Control and Freedom | 1 | `/marked` Remove and subject-topic Remove both commit a permanent delete on first click, no confirm, no undo. |
| 4 | Consistency and Standards | 3 | Rigorously consistent otherwise; the home margin is the only `position: sticky` in the codebase while the identical-looking topic rail is static. |
| 5 | Error Prevention | 1 | Destructive links sit inline and unweighted beside benign ones; the irreversible-merge warning is section-level and scrolls away before the button. |
| 6 | Recognition Rather Than Recall | 3 | "Why this figure" and the painted marks are exemplary. Docked for 15 undifferentiated lessons with no "you are here". |
| 7 | Flexibility and Efficiency | 2 | The graph — the stated centrepiece of the desktop session — has no keyboard path at all. |
| 8 | Aesthetic and Minimalist Design | 4 | Genuinely exceptional. Nothing is ornament; every rule weight maps to a meaning. |
| 9 | Error Recovery | 3 | Plain, actionable copy and a partial-success path that still hands over a working link. No inline field-level recovery. |
| 10 | Help and Documentation | 3 | No help system expected for a single expert user; scored on inline guidance, which is unusually strong. |
| **Total** | | **25/40** | **Solid, with two weak load-bearing heuristics** |

## Design Specificity Verdict

**Strongly grounded. Could not be lifted onto another product.**

The visual world and the domain model are the same object. Freshness is encoded as hatch density because a seed catalogue prints condition as a ruling; `unsown` is reached by a null check before any threshold, so "never started" and "gone cold" stay visibly different facts; row weight is computed from holdings so the shape of the listing is legible before a number is read. The botanical vocabulary is better than the generic alternative — "unsown" carries a meaning that "empty" does not.

**Deterministic scan:** 5 findings (2 warning/slop, 1 warning/quality, 2 advisory). Two `side-tab` warnings at 5px on the reading and sowing sheets are real — the house weight is 2px. The remaining three are false positives: a monospace fallback stack for code, and two graph-canvas node fills the detector itself marks advisory.

## What's Working

1. **State is never carried by colour alone, and it is enforced rather than aspired to.** Every condition ships three carriers: hatch density, the printed word, and an aria-label.
2. **"Why this figure" makes an app-owned score interrogable** — it lists the actual exposures, with an honest "Not much to go on yet" when confidence is low.
3. **The adjudication copy is a model of high-stakes microcopy** — names the safe default, admits the system's own limitation, states the asymmetry of cost, gives a concrete test. Fix its placement, never its words.

## Priority Issues

**[P0] Every lesson scrolls sideways on a phone.** 513px in a 390px viewport — 123px of horizontal drift on the app's primary reading surface. Both assessments found this independently and each found half the cause: `.body` is `display: grid` with no `grid-template-columns`, so the implicit `auto` track refuses to shrink below its widest child, and `.compare tbody th { white-space: nowrap }` sets that child's min-content floor at 445px. The `overflow-x: auto` on `.compareWrap` never engages because its ancestor is already stretched. Fix: `grid-template-columns: minmax(0, 1fr)` on `.body`, `min-width: 0` on `.compareWrap`, and drop the `nowrap`. The topic sheet already gets this right. Suggested command: /impeccable adapt

**[P1] Destructive actions commit on first click.** On `/marked` a row ends "ADD A NOTE · REMOVE" — same size, colour and underline, roughly 8px apart on a phone — and Remove permanently deletes a hand-curated passage with no confirm and no undo. It contradicts the app's own ethic: PendingQueue goes to real lengths to protect a destructive merge. Fix: set the destructive item apart with a rule (the pattern SheetNav already uses for sign-out) and replace the immediate DELETE with an optimistic removal plus "Removed — put it back", reusing the lesson's existing undo. Suggested command: /impeccable harden

**[P1] The focus ring is invisible on every masthead.** One global `--plate-terracotta` ring scores 1.68:1 against the green band, below the 3:1 minimum. Keyboard users lose their place in the header on every page. Fix: a paper-coloured ring inside the band. Suggested command: /impeccable audit

**[P2] Nav contrast fails, worst on the item that matters most.** The current-sheet indicator is 2.92:1; the other nav links, the back link and the figure labels sit at 3.72 to 4.45:1, missing by a hair. Placeholder text on the inbox capture field is the browser default at 3.75:1, while `/subjects/new` styles its own and passes. Fix: raise the nav alpha, darken the current-sheet marker, style the placeholder. Suggested command: /impeccable audit

**[P2] Tap targets fail on height, systemically.** The nav is 12 to 19px tall on every page (CLOSE is 42.6x12); the roots slider's six notches are 35x17. Nearly every failure is vertical padding. Suggested command: /impeccable adapt

**[P2] The topic sheet's rail dies a third of the way down, taking the primary action with it.** 1338px of empty rail; "Read a refresher" is off-screen for roughly 71% of the scroll. PRODUCT.md defines success as acting on a cold area in one click. Fix: `position: sticky`, as the home margin already has. Suggested command: /impeccable layout

**[P3] "Viability" names two different numbers in the same row.** The printed figure is ability; the bar's aria-label announces freshness as "viability 100 per cent". A sighted user reads 11, a screen-reader user hears 100 — collapsing the two-channel distinction the product exists to make. Suggested command: /impeccable clarify

## Persona Red Flags

**Sam (accessibility-dependent):** the graph has no keyboard path at all — no tabIndex, no keydown, no canvas role — and hover-to-highlight is its main exploratory affordance. The masthead focus ring is invisible at 1.68:1. The bar announces the wrong quantity under the right noun.

**Mobile, incidental (from PRODUCT.md):** every lesson scrolls sideways; graph node hit targets are roughly 8px against a 44px minimum; graph labels overlap each other at 390px; the graph control strip eats 25% of the screen before the bed is visible.

**Desktop, deep (from PRODUCT.md):** the topic sheet's primary action scrolls away and never returns; 15 lessons print at equal weight with no resume marker, so "where was I" is re-derived every visit.

**Alex (power user):** duplicate resources accumulate with no row-level action; near-duplicate subjects sit unchallenged while home reports "Nothing awaiting decision"; `/marked` search has no filter by subject or topic.

## Minor Observations

- Generated lesson bodies leak block lead-ins — orphan "steps:", "compare:", "check:" paragraphs above their blocks. The parser is correct; the prompt fix shipped, but existing bodies predate it.
- `compare` tables compress rather than scroll at 390px — the chart rule got `min-width` and the table did not.
- "CLOSE" orphans onto its own line above the wordmark at mobile, reading as a label for it.
- "ALL READ" sits where every other section head prints a count.
- Three phrasings for one noun: SheetNav calls `/graph` "The bed", the subject sheet calls its outline the bed, the footer says "The whole bed".
- Two `side-tab` findings at 5px where the house weight is 2px.

## Questions to Consider

1. The app knows the two subjects are near-identical — why does adjudication only cover topics, when subject and resource duplicates are the ones a real user actually generates?
2. If reading is capped at 3.5 of 5, why is "Worked it" styled identically to the two buttons that cannot break the ceiling?
3. The galley states its shape, not its progress — so what shape is a sowing? The app knows the bed will be 6 to 24 topics before it asks.
4. "Vagueness is a feature where confidence is low" is beautifully executed for ability. Should condition have a vagueness register too?
