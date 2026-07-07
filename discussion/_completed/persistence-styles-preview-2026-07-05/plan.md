# persistence-styles-preview — thread cache, style ingestion, preview, dynamic axes, model routing, neon purple

**Date:** 2026-07-05
**Scope:** packages/protocol, apps/mcp, apps/studio, wiki (Requirements/*, Product/*), README, demo/smoke
**Authority:** operator brief (2026-07-05 evening session); CLAUDE.md rules 1–3, 5, 7, 10
**Status:** closed 2026-07-06

---

## Operator requirements → design

1. **Every SVG cached; `.docs/discussion` is the thread cache.** Session persistence moves
   from `.visual-brainstorm/sessions/` to `<cwd>/.docs/discussion/<stamp>-<slug>/`
   (donor-style: discussion folder persists the whole conversation). Nothing is ever
   regenerated: boards, per-option SVGs, responses, artifacts all on disk, committable
   (NOT gitignored). Claude memory is NOT used for discussion details.
2. **All threads reloadable in the UI.** Bridge gains `GET /api/discussions` (list) and
   `GET /api/discussions/<id>` (full thread). Studio gains a **left nav** listing prior
   discussions; clicking one loads it read-only. MCP gains `list_discussions` +
   `load_discussion` tools, and `present_board` accepts `discussionId` to **resume** a
   prior thread (rounds continue numbering).
3. **Style ingestion framework.** Themes are JSON (`Theme` schema in protocol: name, label,
   light+dark var sets). Built-ins ship in apps/mcp (`themes.ts`); user themes are ingested
   from `<cwd>/<stylesDir>/*.json` (donor-Branding analogue). Selectable **visually** (swatch
   picker in the studio header) and **by config** (`visual-brainstorm.config.json` → `theme`).
4. **Target repo config.** `visual-brainstorm.config.json` (cwd, human-editable):
   `{ targetRepo, stylesDir, theme, models, defaultModel, discussionDir }`. When `targetRepo`
   is set, `capture_artifact` also copies the SVG + provenance into
   `<targetRepo>/brainstorm-artifacts/`.
5. **Full-screen SVG preview.** Every option (survey grid + history thumbnails) opens a
   full-screen modal: wheel zoom, drag pan, pinch zoom (pointer events), +/−/reset/Esc —
   needed for system-design boards; works mobile + desktop.
6. **Dynamic axes, minimum 5.** Axes are authored per board, tailored to the prompt
   (icons → playful/glow; systems → cloud cost/complexity/…). `present_board` REJECTS
   fewer than 5 axes. Axes are ranges (0–100 between two poles), never absolutes.
7. **Model selection + orchestrator delegation.** Studio composer gets a model picker
   (list from config, default `claude-fable-5`, `claude-opus-4-8`, `claude-sonnet-5`,
   `claude-haiku-4-5`). `BoardResponse.model` carries the choice; the tool result instructs
   the orchestrator to delegate next-round generation to that model (subagent with model
   override).
8. **Neon purple replaces orange** as the default accent (`#a855f7`), via the theme system.

## Decisions

- Discussion dirs are distinguished from plan dirs by the presence of `session.json` —
  plans and threads coexist in `.docs/discussion/` (donor pattern: one folder for session
  artifacts of both kinds).
- `.gitignore` keeps ignoring legacy `.visual-brainstorm/` but thread cache under
  `.docs/discussion/` is tracked — "never regenerate" implies committable.
- Theme variables: canvas, surface, surface2, line, ink, inkDim, accent × {light, dark}.
  Studio applies them as CSS custom properties and reacts to scheme changes.
- Axis minimum enforced at the tool boundary (not in the base schema) so historical
  round-1 data stays loadable.
