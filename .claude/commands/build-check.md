---
model: haiku
---

# /build-check — prove the repo works (rule 10)

## Procedure

1. `npm run build` — protocol → studio → mcp, in that order (workspaces handle it). Zero errors.
2. `npm test` — all layers (wiki/System/testing-observability.md): unit
   (`tests/*.test.mjs`, all pass), integration (`SMOKE PASS`), UI render (`UI SMOKE PASS`,
   all six surfaces), and the REAL end-to-end drives (`HUMAN SIM PASS` — real bridge
   `engine` is always Claude, real built studio dist, real browser over CDP).
3. For UI-affecting changes, prove the REAL path — there is no preview/fixture player:
   `npm run test:human` (the goal run drives the changed surface end-to-end against a real
   bridge) and `npm run test:human:sweep` (BREAK SWEEP PASS, 0 findings). To eyeball it,
   start Claude Code in this repo (the MCP server auto-loads via `.mcp.json`) and run a real
   brainstorm — the `open_studio` tool prints the studio URL. `HUMAN SIM SKIP: no
   chromium-family browser found` is a loud skip, never a pass; a launch flake (browser
   never served CDP) is environmental — clear stray harness browser trees and re-run.
4. **For a pipeline or anything that persists to disk, prove the DATA landed, not just the
   math.** A green unit test over in-memory totals passes while the pipe writes nothing —
   the token meter recorded NOTHING for days behind passing tests because no test asserted
   the file EXISTS after a real end-to-end flow. Any persistence/pipe feature needs a test
   that drives the real path and then reads back the artifact off disk (file present,
   contents correct). Absence-of-data is invisible to value assertions.
5. Report results verbatim — failures are reported as failures with output, never smoothed over.

## Changelog
- 2026-07-07 — step 3 rewritten: preview/fixture harness DELETED (operator: "if it only works
  in preview the app is a brick"); UI proof is now the real pathways only (`npm run test:human`
  + `:sweep`, or a live Claude session), never a fixture player (from delete-preview-harness)
- 2026-07-07 — step 4: pipelines/persistence need an existence check (drive the real flow,
  read the artifact back off disk) — value-only unit tests hid a pipe that wrote nothing
  (from ui-changes)
- 2026-07-05 — created (from phase-funnel-ux-2026-07-05)
