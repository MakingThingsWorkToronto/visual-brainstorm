# SVG validity scan + what-good-looks-like (orchestrator reference)

The COMPACT judge-side reference (token economy phase 4): enough to brief the artisan
precisely and to judge/scan what it returns — WITHOUT the full craft doc. The full recipes,
divergence discipline, and per-kind detail live in `SKILL.md`, which the **artisan** loads;
if you find yourself needing them to WRITE SVG, you are doing the artisan's job — delegate.

## Validity scan (run on every delegated SVG before present_board)

- [ ] valid XML: NO duplicate attributes on any element (`<text x=… x=…>` has happened —
      DOMParser rejects it); no stray/unbalanced quotes
- [ ] self-contained: `xmlns` + `viewBox` present; no external refs, raster, or scripts
- [ ] nothing clipped at the edges (4-unit safe margin)
- [ ] `stroke="currentColor"` structure + at most ONE accent — unless a palette constraint
      is active (then: ONLY the named palette colors)
- [ ] `parents` set on every derived option; synthesis offspring combine parents' MEANINGS
      drawn fresh, never a graphical overlay of the parent SVGs

Fix small validity defects inline (cheaper than a re-delegation round); re-delegate only
when the concept itself missed the brief.

## What good looks like (judging a returned round)

- Options are meaningfully DIVERGENT: if two would earn the same one-line description, the
  round is short one idea — send one back.
- Names/descriptions state the IDEA ("Speaking bulb"), never "Option 3".
- One coherent stroke system per board — style is a board-level decision; difference lives
  in the CONCEPT.
- Palette cohesion: named palette colors honored exactly; narrate by the user's color NAMES.

## Briefing reminder (the terse-brief contract)

Your brief carries the round's DELTA only: direction, palette by name, axis deltas, kills,
parents, per-option one-liners — never a re-teaching of how to draw (the artisan's skill
carries the craft). On a digest-flagged TWEAK, hand the artisan the `round-NN/option-<id>.svg`
source paths + only the deltas: mutate, don't redraw.

## Changelog
- 2026-07-09 — created: judge-side split of svg-authoring so the orchestrator stops carrying
  the full craft doc it delegates away (token-economy phase 4)
