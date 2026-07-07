# /build-check — prove the repo works (rule 10)

## Procedure

1. `npm run build` — protocol → studio → mcp, in that order (workspaces handle it). Zero errors.
2. `npm test` — all three layers (wiki/System/testing-observability.md): unit
   (`tests/*.test.mjs`, all pass), integration (`SMOKE PASS`), UI render (`UI SMOKE PASS`,
   all six surfaces).
3. For UI-affecting changes: `npm run preview` (optionally `npm run preview -- <phase>` to
   open a specific surface), load the printed URL, and confirm the changed surface renders.
   The preview harness shows static fixtures only — real brainstorms run through Claude.
   The bridge falls back to an ephemeral port if 5199 is busy — trust the printed URL.
4. **For a pipeline or anything that persists to disk, prove the DATA landed, not just the
   math.** A green unit test over in-memory totals passes while the pipe writes nothing —
   the token meter recorded NOTHING for days behind passing tests because no test asserted
   the file EXISTS after a real end-to-end flow. Any persistence/pipe feature needs a test
   that drives the real path and then reads back the artifact off disk (file present,
   contents correct). Absence-of-data is invisible to value assertions.
5. Report results verbatim — failures are reported as failures with output, never smoothed over.

## Changelog
- 2026-07-07 — step 4: pipelines/persistence need an existence check (drive the real flow,
  read the artifact back off disk) — value-only unit tests hid a pipe that wrote nothing
  (from ui-changes)
- 2026-07-05 — created (from phase-funnel-ux-2026-07-05)
