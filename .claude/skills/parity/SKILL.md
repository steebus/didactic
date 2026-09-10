---
name: parity
description: Check a diff against docs/monorepo/PARITY.md — that every surface or capability the change touches has its row moved to the right status on both platforms, and that shared logic went to packages/core rather than into one app. Use before pushing any change under apps/, packages/, or src/ (before the monorepo move) that adds, removes or changes what a user can see or do.
---

# Parity check

The record at `docs/monorepo/PARITY.md` is only true if it is moved in the
same commit as the code. This skill reads the diff and the record and says
what is out of step. It changes nothing on its own; it reports.

## Steps

1. **Read the diff.** `git diff main...HEAD --stat` and then the files. If
   the branch is `main`, use the last commit. Note every surface (a page,
   a screen) and every capability (a control, a state, a call) that the
   change adds, removes or alters.

2. **Read the record.** `docs/monorepo/PARITY.md`, both tables and the
   backend table.

3. **For each touched surface or capability, find its row.** Then ask:
   - Is there a row at all? A change to something with no row is a new
     feature, and the row was due before the code.
   - Does the row's status for the platform changed match what the diff
     does? Code that builds a thing whose row still says `planned` is out
     of step; code that removes a thing whose row says `built` likewise.
   - Does the other platform's cell still hold? If the web changed how a
     figure is printed and the phone's row says `built`, the phone either
     changed in the same diff or the row should now say `partial` with
     the difference in Notes.
   - Are `partial` and `n/a` cells carrying a reason in Notes?

4. **Check where the logic went.** For any function or constant the diff
   adds that computes a number, a word, or a shape the other platform also
   prints (viability, state words, hatch, specimen geometry, route
   captions, confirmation wording), it belongs in `packages/core` (or
   `src/lib` while the move is pending, in a module with no platform
   imports). Inline in a component is a finding.

5. **Check the API rule.** Any change under `app/api/` that removes or
   renames a response field or adds a required body field without a row
   in the deprecations table of `docs/monorepo/guides/api-contract.md` is
   a finding. Any new route without an `ENDPOINTS` entry (after Phase 2)
   or a row in the contract table is a finding.

6. **Check the design record.** A change to a CSS custom property in
   `globals.css` without the same change in `.impeccable/design-tokens.json`
   (and `packages/tokens` after Phase 2) is a finding. A new visual rule
   without a `DESIGN.md` amendment is a finding.

## Report

A short list, most serious first, each item naming the file and the row.
If nothing is out of step, say so in one line. Do not edit `PARITY.md`
yourself unless asked; the person or agent making the change moves the
row, because they know what the true status is.
