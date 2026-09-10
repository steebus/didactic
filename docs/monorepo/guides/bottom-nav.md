# The foot bar

The running head printed five sheet links and Close into every masthead
band. Both front ends move the sheets to a bar across the foot of the
screen, put Close inside a settings sheet the bar also reaches, and leave
the band with the way back and Sow. This is the specification for both
platforms, and the text that goes into `DESIGN.md` when the web half lands
(Phase 3) so the design record stays true.

## What it carries

| Position | Glyph | Label | Address | Notes |
| --- | --- | --- | --- | --- |
| 1 | the packet | Stock list | `/` | `Stock` below 360px, if the six do not fit. |
| 2 | the plan | The bed | `/graph` | |
| 3 | the shelf | Library | `/library` | |
| 4 | the label stake | Marked | `/marked` | |
| 5 | the tray | Inbox | `/inbox` | Carries the tally stamp when anything is waiting. |
| 6 | the trowel | Settings | `/settings` | Holds Close; grows from there. |

Not in the bar, and why:

- **Sow** is a form you go to on purpose, not a place you glance at. It
  prints in the running head, right-aligned, as an action link with the
  mustard underline (`DESIGN.md` §4, *an action is a link with a mustard
  underline*).
- **Close** is the one navigation that leaves, and it does not need to be
  a press away on every sheet. It sits on the settings sheet under its own
  rule, where anything else that configures the catalogue will join it.

## Glyphs

The world has no icon set and `DESIGN.md` §5 says why: *forms are seeds
and specimens, not category icons*. The bar's glyphs follow the emblem
rules rather than borrowing an icon font.

| Rule | In the bar |
| --- | --- |
| Reversed, not drawn | A paper silhouette on the green band. No strokes, no outlines, no line art. |
| Must read at 24px | One silhouette each, no interior detail finer than 2px at that size. Checked at 24 and 48 before wiring. |
| Grower's objects, not UI metaphors | A seed packet for the stock list; a planting plan (a ruled square with three seeds in a drill) for the bed; a shelf of three stacked sheets for the library; a plant label stake for marked; a seed tray for the inbox; a trowel for settings. No magnifying glass, gear, house or bookmark. |
| The word is the carrier | The label register prints under every glyph, always. A glyph without its word is a category icon. |
| Shared once | Path data in `@didactic/core`'s `specimens.ts`, drawn by `<svg>` on the web and `react-native-svg` on the phone, on a 24-unit viewBox. |

Six glyphs at 24px with labels beneath fit at 390px in cells of 65px,
which is why the count could rise from five once the label was no longer
the only thing in the cell.

## Material

The bar is the masthead's band, printed at the foot.

| Part | Web | Mobile |
| --- | --- | --- |
| Ground | `var(--plate-green)` | `tokens.colour.plate.green` |
| Rule | `border-top: 4px solid var(--plate-mustard)` (the graph strip's weight) | `borderTopWidth: 4, borderTopColor: mustard` |
| Height | `--foot-bar: calc(3.75rem + env(safe-area-inset-bottom))` | `60 + insets.bottom` |
| Cell | glyph 24px, `--space-1` gap, label beneath; centred; `flex: 1` | the same, `Pressable` filling the cell |
| Label | The label register: `--step--2`, `0.1em`, uppercase, `--font-text` | Archivo, `11`, `letterSpacing: 1.1`, uppercase |
| Glyph and label at rest | `rgba(239,231,214,0.82)` (the measured 4.5:1 floor, as the head uses) | the same rgba, as `fill` and `color` |
| The sheet you are on | glyph and label in `var(--paper)`, label at 600, `border-bottom: 2px solid var(--plate-mustard)` on the label; `aria-current="page"`; a `<span>`, not a link | paper, `fontWeight: '600'`, a `2` high mustard rule under the label; `accessibilityState={{ selected: true }}` |
| Hit target | The whole cell, full bar height | the whole cell, at least 44 high |
| Tally | The existing `.tally` stamp: mustard ground, ink text, `0.9em`, weight 700, no radius, at the tray's top-right corner | the same, drawn as a `View` + `Text` |
| Feedback | `color`, `fill` and `border-bottom-color` at `--dur-feedback` | opacity at `motion.feedback` on press |
| Corners | `0`, everywhere | `0`, everywhere |

Rules that carry over from the running head unchanged:

- **The sheet you are on is stated, not offered.** The current cell does
  not navigate.
- **Reversed-out text on a plate band uses paper at alpha, never a
  different hue.** The glyphs obey the same rule as the words.
- **Colour alone carries nothing.** Current is weight plus rule plus the
  `aria-current` / `accessibilityState`; the tally is a number.

## Where it stands

**Web.** `position: fixed; inset: auto 0 0 0; z-index` above the sheet,
rendered from `layout.tsx` *outside* `main`. `main` arrives under a
`transform` animation, which makes it the containing block for anything
fixed inside it (`DESIGN.md` §8, *anything measured against the window
hangs off the body*). The `body` takes `padding-bottom: var(--foot-bar)`
so the sheet's foot is never under the bar. On wide screens the bar still
spans the window on the press bed, and its six cells sit centred in a row
no wider than `var(--sheet-max)`, so the glyphs line up with the sheet
rather than the window's edges.

Everything that docks at the foot today stands on the bar instead of the
window edge: the docked mark panel, the touch offer, the graph's bottom
sheet, and the note button's sticky line all use `bottom: var(--foot-bar)`
(the offer and panel add their own existing inset to it). The graph canvas
inset grows by the same token.

Hidden on `/enter`: until the door opens there is nowhere to go
(`DESIGN.md` §4).

**Mobile.** A custom `tabBar` on the Expo Router `Tabs` in
`app/(sheets)/_layout.tsx`, padded by `useSafeAreaInsets().bottom`, hidden
when the keyboard is up on Android. Sheets pushed above the six (a topic,
a lesson) keep the bar visible: it is the catalogue's foot, not the tab's.
On the lesson sheet the reader's WebView ends at the bar.

## The settings sheet

`/settings` on both. A sheet like any other: the band, the title, and
ruled sections in the label register. To begin with it holds one section,
*The door*, with Close as a filled button (it commits something: the
session ends), pressing to terracotta. New sections are added under their
own rules; nothing is added to the bar.

## Keyboard and reader

- `<nav aria-label="Sheets">` on the web; `accessibilityRole="tablist"`
  on the container and `"tab"` on each cell on the phone.
- Each glyph is `aria-hidden`; the label is the accessible name.
- Tab order runs after the sheet's content, so a reader reaches the
  material before the furniture.
- Focus ring on the web: the band's `--focus-ink`, because terracotta on
  green is invisible (`globals.css`).

## The running head after the move

`SheetNav` keeps its name and its place inside the band, and carries two
things: the back link (left, when there is one) and Sow (right). The
`current` prop moves to the bar. On the stock list, which has no back
link, the head prints only Sow. The filed-under line, the title, and the
5px head rule are unchanged.

## DESIGN.md amendment

Replace §4 *The running head* with:

> ### The running head, and the foot bar
>
> The band's running head (`SheetNav`) carries the way back, top-left, and
> **Sow**, right: the one form you go to on purpose, as an action link with
> the mustard underline. A back link pointing where Sow points removes it.
>
> The sheets are printed once, in a **foot bar** across the bottom of the
> screen: the same plate band as the masthead, `--plate-green` under a
> `4px solid var(--plate-mustard)` rule, `var(--foot-bar)` tall including
> the device's own inset. Six cells — Stock list, The bed, Library, Marked,
> Inbox, Settings — each a 24px paper silhouette over its label. The
> silhouettes are specimens in the emblem's idiom (a packet, a planting
> plan, a shelf, a label stake, a tray, a trowel), reversed on the band
> and never drawn as line art; the label register prints under every one,
> because the word is the carrier. Rest is `rgba(239,231,214,0.82)`; the
> sheet you are on is stated in full paper at 600 with a `2px` mustard rule
> beneath, as a `<span aria-current="page">`, never a link. The tray carries
> the tally stamp. Each cell is the full height of the bar and an equal
> share of its width, which is what makes it reachable on a phone.
>
> The bar hangs off the body, not the sheet, because `main` arrives under a
> transform; the body gives up `var(--foot-bar)` at its foot so nothing
> prints under it, and everything that docks at the foot — the mark panel,
> the offer, the graph's bottom sheet — stands on the bar rather than the
> window edge. The entry sheet has no bar: until the door opens there is
> nowhere else to go.
>
> Leaving is not in the bar. **Close** sits on the settings sheet as a
> filled button under its own rule, where the rest of what configures the
> catalogue will join it.

Add to §3: `--foot-bar` · `calc(3.75rem + env(safe-area-inset-bottom))` ·
*the height of the foot bar, and the room the body gives it.*

Add to §5, after *Subject plates*: **Bar glyphs** — six silhouettes on a
24-unit viewBox, held to the same rules as the plates: reversed, not
drawn; must read at 24px; grower's objects, not category icons.

Amend §8's *Docked* row: "Across the foot of the screen, above the foot
bar, below `40rem`…". Amend §10's `40rem` row: "…every mark panel docks
above the foot bar…".
