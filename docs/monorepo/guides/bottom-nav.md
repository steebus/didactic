# The foot bar

The running head printed five sheet links into every masthead band. Both
front ends move those five to a bar across the foot of the screen, and the
band keeps only the way back, Sow, and Close. This is the specification
for both platforms, and the text that goes into `DESIGN.md` when the web
half lands (Phase 3) so the design record stays true.

## What it carries

| Position | Label | Address | Notes |
| --- | --- | --- | --- |
| 1 | Stock list | `/` | `Stock` below 360px, if the five do not fit. |
| 2 | The bed | `/graph` | |
| 3 | Library | `/library` | |
| 4 | Marked | `/marked` | |
| 5 | Inbox | `/inbox` | Carries the tally stamp when anything is waiting. |

Not in the bar, and why:

- **Sow** is a form you go to on purpose, not a place you glance at. It
  prints in the running head, right-aligned, as an action link with the
  mustard underline (`DESIGN.md` §4, *an action is a link with a mustard
  underline*).
- **Close** is the one navigation that leaves. It stays in the running
  head beside Sow, divided from it by the same `1px` paper-at-alpha rule it
  has now.

Five is the most this label register carries at 390px: five uppercase
labels at 11px with 0.1em tracking, plus the tally, measure roughly 285px
before gaps. Six do not fit without an icon set, and this world has none.

## Material

The bar is the masthead's band, printed at the foot.

| Part | Web | Mobile |
| --- | --- | --- |
| Ground | `var(--plate-green)` | `tokens.colour.plate.green` |
| Rule | `border-top: 4px solid var(--plate-mustard)` (the graph strip's weight) | `borderTopWidth: 4, borderTopColor: mustard` |
| Height | `--foot-bar: calc(3.25rem + env(safe-area-inset-bottom))` | `52 + insets.bottom` |
| Label | The label register: `--step--2`, `0.1em`, uppercase, `--font-text` | Archivo, `11`, `letterSpacing: 1.1`, uppercase |
| Label at rest | `rgba(239,231,214,0.82)` (the measured 4.5:1 floor, as the head uses) | the same rgba |
| The sheet you are on | `var(--paper)`, weight 600, `border-bottom: 2px solid var(--plate-mustard)` on the label; `aria-current="page"`; a `<span>`, not a link | paper, `fontWeight: '600'`, a `2` high mustard rule under the label; `accessibilityState={{ selected: true }}` |
| Hit target | The whole cell, full bar height, `flex: 1` | `Pressable` filling the cell, minimum 44 high |
| Tally | The existing `.tally` stamp: mustard ground, ink text, `0.9em`, weight 700, no radius | the same, drawn as a `View` + `Text` |
| Feedback | `color` and `border-bottom-color` at `--dur-feedback` | opacity at `motion.feedback` on press |
| Corners | `0`, everywhere | `0`, everywhere |

Rules that carry over from the running head unchanged:

- **The sheet you are on is stated, not offered.** The current cell does
  not navigate.
- **Reversed-out text on a plate band uses paper at alpha, never a
  different hue.**
- **Colour alone carries nothing.** Current is weight plus rule plus the
  `aria-current` / `accessibilityState`; the tally is a number.

## Where it stands

**Web.** `position: fixed; inset: auto 0 0 0; z-index` above the sheet,
rendered from `layout.tsx` *outside* `main`. `main` arrives under a
`transform` animation, which makes it the containing block for anything
fixed inside it (`DESIGN.md` §8, *anything measured against the window
hangs off the body*). The `body` takes `padding-bottom: var(--foot-bar)`
so the sheet's foot is never under the bar. On wide screens the bar still
spans the window on the press bed, and its five cells sit centred in a row
no wider than `var(--sheet-max)`, so the labels line up with the sheet
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
when the keyboard is up on Android. Sheets pushed above the five (a topic,
a lesson) keep the bar visible: it is the catalogue's foot, not the tab's.

## Keyboard and reader

- `<nav aria-label="Sheets">` on the web; `accessibilityRole="tablist"`
  on the container and `"tab"` on each cell on the phone.
- Tab order runs after the sheet's content, so a reader reaches the
  material before the furniture.
- Focus ring on the web: the band's `--focus-ink`, because terracotta on
  green is invisible (`globals.css`).

## The running head after the move

`SheetNav` keeps its name and its place inside the band, and carries three
things: the back link (left, when there is one), and Sow and Close (right).
The `current` prop moves to the bar. On the stock list, which has no back
link, the head prints only Sow · Close. The filed-under line, the title, and
the 5px head rule are unchanged.

## DESIGN.md amendment

Replace §4 *The running head* with:

> ### The running head, and the foot bar
>
> The band's running head (`SheetNav`) carries the way back, top-left, and
> two controls, right: **Sow**, the one form you go to on purpose, as an
> action link with the mustard underline; and **Close**, the one navigation
> that leaves, divided from it by a `1px solid rgba(239,231,214,0.35)` rule.
> A back link pointing where a control points removes the control.
>
> The five sheets — Stock list, The bed, Library, Marked, Inbox — are
> printed once, in a **foot bar** across the bottom of the screen: the same
> plate band as the masthead, `--plate-green` under a `4px solid
> var(--plate-mustard)` rule, `var(--foot-bar)` tall including the device's
> own inset. Labels are the label register at `rgba(239,231,214,0.82)`;
> the sheet you are on is stated in full paper at 600 with a `2px` mustard
> rule beneath, as a `<span aria-current="page">`, never a link. The inbox
> label carries the tally stamp. Each cell is the full height of the bar
> and an equal share of its width, which is what makes it reachable on a
> phone.
>
> The bar hangs off the body, not the sheet, because `main` arrives under a
> transform; the body gives up `var(--foot-bar)` at its foot so nothing
> prints under it, and everything that docks at the foot — the mark panel,
> the offer, the graph's bottom sheet — stands on the bar rather than the
> window edge. The entry sheet has no bar: until the door opens there is
> nowhere else to go.

Add to §3: `--foot-bar` · `calc(3.25rem + env(safe-area-inset-bottom))` ·
*the height of the foot bar, and the room the body gives it.*

Amend §8's *Docked* row: "Across the foot of the screen, above the foot
bar, below `40rem`…". Amend §10's `40rem` row: "…every mark panel docks
above the foot bar…".
