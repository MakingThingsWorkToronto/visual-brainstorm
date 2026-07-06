# /add-theme — add or ingest a studio theme

## Procedure

1. **Decide built-in vs ingested**: built-ins ship with the tool (`apps/mcp/src/themes.ts`);
   user/project themes are JSON drop-ins in the project's `stylesDir` (default `styles/`).
2. **Shape** — conform to `ThemeSchema` (`packages/protocol`): `name` (kebab), `label`,
   and BOTH `light` and `dark` variant objects with all seven vars:
   `canvas, surface, surface2, line, ink, inkDim, accent`. Copy `styles/sunset.json` as a template.
3. **Contrast check** — ink on canvas/surface must stay readable in both schemes (AA-ish);
   accent must read against surface in both. Dark accents usually need to be LIGHTER than
   their light-mode counterpart.
4. **Verify** — `npm run preview`, open the theme picker, apply the theme, check both OS
   schemes (or toggle the OS setting), confirm sliders/buttons/rings recolor.
5. Built-in additions also need: rebuild (`npm run build -w apps/mcp`) and a smoke run.

## Changelog
- 2026-07-05 — created (from phase-funnel-ux-2026-07-05)
