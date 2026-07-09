---
model: haiku
---

# /add-theme — add or ingest a studio theme

## Procedure

1. **Decide built-in vs ingested**: built-ins ship with the tool (`apps/mcp/src/themes.ts`);
   user/project themes are JSON drop-ins in the project's `stylesDir` (default `styles/`).
2. **Shape** — conform to `ThemeSchema` (`packages/protocol`): `name` (kebab), `label`,
   and BOTH `light` and `dark` variant objects with all seven vars:
   `canvas, surface, surface2, line, ink, inkDim, accent`. Copy `styles/sunset.json` as a template.
3. **Contrast check** — ink on canvas/surface must stay readable in both schemes (AA-ish);
   accent must read against surface in both. Dark accents usually need to be LIGHTER than
   their light-mode counterpart. Note `accent` also drives the ambient liquid-chrome FX
   (aurora background, left-nav edge glow, the surface gloss, the Send & iterate spin
   border — all `color-mix` off `--accent`/`--surface*` in `styles.css`), so a saturated
   accent reads as vivid ambient motion and a muted one as a whisper — pick with that in mind.
4. **Verify** — `npm run smoke:ui` renders the theme picker; to eyeball the palette, start
   Claude Code in this repo and open the studio (`open_studio`), apply the theme, check both
   OS schemes (or toggle the OS setting), confirm sliders/buttons/rings recolor. (There is no
   fixture preview harness — the studio is only ever driven by a real Claude session.)
5. Built-in additions also need: rebuild (`npm run build -w apps/mcp`) and a smoke run.

## Changelog
- 2026-07-09 — step 3: flag that `accent` now drives the ambient liquid-chrome FX
  (aurora/nav-glow/gloss/spin-border), so accent saturation sets the ambient-motion intensity
  (from liquid-chrome-effects-2026-07-09)
- 2026-07-05 — created (from phase-funnel-ux-2026-07-05)
