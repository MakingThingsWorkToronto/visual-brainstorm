# Studio blank-page crash + client-error observability — 2026-07-07

**Status:** closed 2026-07-07

## Symptom
Studio "flashes briefly then goes blank" (operator report). Bridge log showed only
connect/disconnect pairs ~100–450ms apart — zero evidence of why.

## Diagnosis (evidence)
- Repro via headless Edge + CDP (`scratchpad/crash-repro.mjs`): uncaught
  `TypeError: Cannot read properties of undefined (reading 'length')` in minified `Bf`
  = `SessionActivity` (`events.length` with `events === undefined`); React unmounts the
  root → `#root` has 0 children → blank page.
- Root cause: **version skew + wholesale state replace.** The long-running bridge
  process (started 2026-07-06 23:50, old compiled code) sends a `hello` state without
  `progress`/`tokens`/`artifactChat`. `useBridge` does `case 'hello': return msg.state`
  — the older envelope replaces the typed EMPTY defaults, and the freshly rebuilt studio
  bundle (which renders `state.progress`) crashes.
- Observability gap: a client-side crash is invisible in the bridge log/ring; the
  ui-smoke layer is JSDOM SSR and structurally cannot catch browser-runtime crashes.

## Plan
1. **Fix (studio)**: `useBridge` hello handler merges over defaults —
   `{ ...EMPTY, ...msg.state }` — so any missing state field degrades to its default
   instead of crashing. This inoculates every future field addition against skew.
2. **Observability (studio)**: global `error` + `unhandledrejection` listeners and a
   React error boundary in `main.tsx`. The boundary renders a visible crash panel
   (message + stack + reload) instead of a blank page; both paths POST the error to
   the bridge.
3. **Observability (bridge)**: new `POST /api/client-log` — validated, size-capped —
   writes `STUDIO CLIENT ERROR: …` through the normal log sink (FileLog + `/api/logs`
   ring). Reporter is fire-and-forget and swallows failures (old servers 404 it).
4. **Tests** (test-engineer): unit-test `/api/client-log` (accept/reject/log-line);
   ui-smoke markers for the error-boundary fallback panel.
5. **Verify**: `npm run build` + `npm test` + CDP re-run against the STILL-OLD running
   bridge proving the page now renders (the exact skew scenario), then the user answers
   round 1 of the live brainstorm.
6. Wiki (`System/testing-observability.md`) + `.agents/learnings.md` + closeout later.

## Progress
- [x] Diagnosis with repro
- [x] Fixes 1–3 (useBridge hello merge; CrashBoundary + global reporters; POST /api/client-log)
- [x] Tests: tests/client-log.test.mjs (4 tests — valid/optional-stack/rejections/32k cap)
      + ui-smoke CrashBoundary section (pass-through + seeded-fallback markers).
      npm test green: 64/64 unit, smoke pass, ui-smoke pass. Deliberately skipped:
      useBridge hello-merge (inline in a WS closure; frameworkless coverage would need
      mocks or a test-only export — extract a pure reduce(prev, msg) if wanted later)
- [x] Verified: CDP re-run vs the STILL-OLD bridge — no exception, root renders (48KB DOM)
- [x] Learnings appended (skew signature, CDP repro pattern, awaitingResponse semantics)
- [x] Wiki: testing-observability.md (client-error pipeline, health semantics, crash-loop
      signature) + system-architecture.md (endpoint, StudioState-defaults guardrail,
      stale diagnose-demo.md reference fixed); both logged in wiki/log.md
