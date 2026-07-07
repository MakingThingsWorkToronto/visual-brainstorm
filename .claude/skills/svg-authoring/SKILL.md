---
name: svg-authoring
description: How to author board-option SVGs for Visual Brainstorm — conventions, divergence discipline, per-kind recipes, and the quality checklist. Load before every present_board call.
---

# SVG Authoring for Boards

## Hard rules (violations break the studio or the brainstorm)

1. Self-contained: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">` (48-grid for
   icons; 0 0 400 300 for system-maps/storyboards). No external refs, no raster, no scripts —
   the studio strips them anyway.
2. Use `stroke="currentColor"` for structure so options adapt to light/dark themes; reserve
   ONE explicit accent color per board for emphasis (take it from the user's stated palette).
3. Icon stroke style: `stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"`,
   `fill="none"` unless the concept demands fills. Keep every option in the SAME style —
   style is a board-level decision, difference lives in the CONCEPT.
4. Every option gets a real name (its idea, e.g. "Speaking bulb"), a one-line description of
   the intent, 1–3 lowercase tags (used by the cluster scaffold), and `parents` listing the
   prior-round option ids it descends from.

## Divergence discipline

6 near-identical options is a wasted round. Before writing SVG, list the axes the user cares
about and place each option at a DIFFERENT coordinate: at least one literal, one abstract,
one structural, one minimal. If two options would earn the same one-line description, delete one.

## Per-kind recipes

- **icon-grid**: 4–8 options, 48-grid, single silhouette read at small size. Test mentally at 16px.
- **system-map**: 2–4 options max (they're dense), viewBox 400×300, labeled boxes
  (`<text font-size="12">`), arrows via `<path>` + small triangle, group related nodes with a
  dashed container. Each option = a genuinely different topology (monolith / hub-and-spoke /
  event bus / layered), not the same diagram rearranged.
- **storyboard**: 3–6 frames per option inside one SVG, frame borders, stick-level figures fine.
- **palette**: swatch rows + a tiny sample application (button/card mock) inside the SVG.
- **moodboard**: texture/typography/composition studies; abstraction welcome.
- **mindmap**: radial node trees; center node = the seed concept.
- **matrix**: grid with row/column labels; highlight the diagonal of tradeoffs.

## Palette constraint

When the response or digest carries `paletteColors` / a "Discussion theme" palette line,
those NAMED colors are a hard constraint: draw with ONLY them (structure may stay
currentColor where a theme-agnostic read matters, e.g. option thumbnails). Refer to the
colors by their names in prompts and option descriptions — the user picked and possibly
renamed them, and speaks in those names.

## Quality checklist (run before present_board)

- [ ] viewBox present, nothing clipped at edges (4-unit safe margin)
- [ ] currentColor structure + at most one accent — UNLESS a palette constraint is active
      (then: only the named palette colors)
- [ ] names/descriptions state the IDEA, not "Option 3"
- [ ] options are divergent per the discipline above
- [ ] parents set for every derived option (lineage is the product)
- [ ] remix/synthesis offspring combine the parents' MEANINGS drawn fresh — never a
      graphical overlay/composite of the parent SVGs (system-map: merge the architectures
      into one clean diagram)

## Changelog
- 2026-07-06 — palette constraint: honor paletteColors / discussion-theme palettes, name
  colors by their user-visible names (from ui-changes)
- 2026-07-05 — created (from phase-funnel-ux-2026-07-05)
