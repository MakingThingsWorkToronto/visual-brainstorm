# /build-check — prove the repo works (rule 10)

## Procedure

1. `npm run build` — protocol → studio → mcp, in that order (workspaces handle it). Zero errors.
2. `npm run smoke` — headless present→respond round-trip, thread cache list/reload/resume,
   themes, model routing, artifact capture. Must print `SMOKE PASS`.
3. For UI-affecting changes: `npm run demo` (optionally `npm run demo -- <phase>` to open a
   specific phase mechanic), load the printed URL, and confirm the changed surface renders.
   The bridge falls back to an ephemeral port if 5199 is busy — trust the printed URL.
4. Report results verbatim — failures are reported as failures with output, never smoothed over.

## Changelog
- 2026-07-05 — created (from phase-funnel-ux-2026-07-05)
