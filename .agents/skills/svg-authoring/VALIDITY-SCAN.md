# SVG validity scan + what-good-looks-like (orchestrator reference)

The COMPACT judge-side reference (token economy phase 4): enough to brief the artisan
precisely and to judge/scan what it returns — WITHOUT the full craft doc. The full recipes,
divergence discipline, and per-kind detail live in `SKILL.md`, which the **artisan** loads;
if you find yourself needing them to WRITE SVG, you are doing the artisan's job — delegate.

## Validity scan (run on every delegated SVG before present_board)

> Deliberate two-copy overlap with `SKILL.md` § Quality checklist — a change to either
> checklist updates BOTH files in the same edit (drift here silently splits judge vs artisan).

- [ ] valid XML: NO duplicate attributes on any element (`<text x=… x=…>` has happened —
      DOMParser rejects it); no stray/unbalanced quotes
- [ ] self-contained: `xmlns` + `viewBox` present; no external refs, raster, or scripts
- [ ] nothing clipped at the edges (4-unit safe margin)
- [ ] `stroke="currentColor"` structure + at most ONE accent — unless a palette constraint
      is active (then: ONLY the named palette colors)
- [ ] `parents` set on every derived option; synthesis offspring combine parents' MEANINGS
      drawn fresh, never a graphical overlay of the parent SVGs

Fix small validity defects inline (cheaper than a re-delegation round); re-delegate only
when the concept itself missed the brief. The inline boundary: ATTRIBUTE-level repair only
(a duplicate attribute, missing `xmlns`/`viewBox`, a stray quote) — anything touching
geometry, paths, or drawn content is artisan work and goes back via re-delegation ("never
draws board SVGs inline" includes redrawing parts of one).

## What good looks like (judging a returned round)

- Options are meaningfully DIVERGENT: if two would earn the same one-line description, the
  round is short one idea — send one back.
- Names/descriptions state the IDEA ("Speaking bulb"), never "Option 3".
- One coherent stroke system per board — style is a board-level decision; difference lives
  in the CONCEPT.
- Palette cohesion: named palette colors honored exactly; narrate by the user's color NAMES.
- Motion only when BRIEFED (SMIL only, no scripts): if any option animates, all on the board
  do with equal weight — one pulsing option biases the side-by-side judgment; and the static
  read must carry the idea on its own (SKILL.md § Living lines).

## Briefing reminder (the terse-brief contract)

Your brief carries the round's DELTA only: direction, palette by name, axis deltas, kills,
parents, per-option one-liners — never a re-teaching of how to draw (the artisan's skill
carries the craft). On a digest-flagged TWEAK, hand the artisan the digest's label→file
source mapping (`"Label" → round-NN/option-<id>.svg`) + only the deltas: mutate, don't
redraw — and keep the digest's **MUTATE** keyword verbatim in the brief: the token pipe
bins the delegation as `tweak` (vs `generation`) by that exact marker, so dropping it
misfiles the round's cost.

## Changelog
- 2026-07-09 — created: judge-side split of svg-authoring so the orchestrator stops carrying
  the full craft doc it delegates away (token-economy phase 4)
- 2026-07-09 — briefing reminder: label→file mapping + keep the MUTATE marker verbatim (the token pipe bins tweak-vs-generation by it) (fresh-eyes round 2 of token-economy-2026-07-07)
- 2026-07-09 — judging: motion only when briefed, uniform across the board, static read carries (pairs SKILL.md § Living lines) (token-economy fresh-eyes round 3)
- 2026-07-09 — inline-fix boundary defined: attribute-level repair inline OK; geometry/paths/content re-delegates (token-economy-followups phase 4)
