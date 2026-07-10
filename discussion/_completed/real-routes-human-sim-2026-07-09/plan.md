# Real routes for human-sim — the orchestrator side stops being faked

**Status:** closed 2026-07-09.
**Trigger (operator, 2026-07-09):** "review this repo and remove any preview related functionality… ask if the code only runs in preview or only passes tests using canonical seed data and would not pass or would be ambiguous in real world testing… Iterate until the preview harness is replaced with real routes and human-sim reflects this and the app is green for human testing."

## Review verdict (recorded first)

The `delete-preview-harness-2026-07-07` plan removed the fixture player and the `engine`
discriminator. What SURVIVED is subtler and fails the operator's spirit test:

1. **Every browser harness fakes the orchestrator.** `scripts/lib/sim-runner.mjs` constructs
   `Bridge` **in-process** and the sims call its producers directly
   (`bridge.askConcierge` / `presentGallery` / `presentAndWait` / `announceArtifact` /
   `drainCommands`) — the exact anti-pattern CLAUDE.md rule 10 names: *"a test that calls the
   surface's producer itself, e.g. `bridge.presentGallery`, proves nothing about a real run."*
   The REAL route — Claude Code → stdio MCP `tools/call` → `apps/mcp/src/index.ts` tool
   handlers (option/axes validation, the concierge→gallery **intake lock**, retitle,
   feedback-digest construction, gallery caching, rearm-after-detour, `copyToTargetRepo`) —
   is exercised by **zero** journey tests. A tool-layer regression keeps every sim green:
   ambiguous in real-world testing, by construction.
2. **Vestigial preview-era hook:** `Bridge.onQueuedCommand` ("demo orchestrator hook") — set
   by nothing in the repo since the preview harness died. Dead product code.
3. **Stale pointer:** `apps/mcp/src/log.ts` cites `.claude/commands/diagnose-demo.md`
   (does not exist; it's `diagnose-studio.md`).
4. Canonical fixtures themselves are FINE (rule 11: harness/test code stays dumb, fixtures
   only) — the defect is the *pathway*, not the data. Studio "preview" hits are the product
   fullscreen viewer (kept deliberately in the 2026-07-07 plan).

## Scope

Rewire the browser harnesses so the orchestrator side IS the real route: each sim spawns the
**built stdio MCP server** (`apps/mcp/dist/index.js`, cwd = scratch, `VIBR_HOME` = scratch)
and plays Claude by issuing real `tools/call` requests; the browser side stays raw CDP.

### Phase B1 — infrastructure
- `scripts/lib/mcp-client.mjs` (NEW): newline-delimited JSON-RPC over the child's stdio —
  `initialize` → `notifications/initialized` → concurrent `tools/call` (promise per id);
  stderr → captured log lines; honest teardown. Same protocol dance `tests/copilot-mcp.test.mjs`
  already proves.
- `scripts/lib/sim-runner.mjs`: replace the in-process `Bridge` with the spawned MCP server;
  write a scratch `visual-brainstorm.config.json` (models, theme, stylesDir with the canonical
  theme); discover the studio URL via the tool results / `.logs/bridge-port.json`; keep the
  crash-checkpoint discipline verbatim (`GET /api/logs` is unchanged). Context handed to
  sims: `tools.call(name, args)` (+ a fire-off variant) instead of `bridge`.
- Remove `onQueuedCommand` + fix the `log.ts` stale pointer (Phase A rolled in here).

### Phase B2 — the five sims + sweep as real orchestrations
- `human-sim.mjs` (flagship): open_studio (blocking) → brief submitted returns the command →
  ask_concierge → present_gallery (intake lock satisfied FOR REAL) → present_board →
  capture_artifact — every step a real tool call; assert the returned `feedbackDigest` too
  (the digest is what the real orchestrator acts on — now it's finally under test).
- `human-sim-livechat.mjs` / `-boardchat.mjs` / `-mindchat.mjs`: boards presented via
  `present_board` tool (unawaited while the browser drives); chat replies via the real
  `reply_artifact_chat`; boardchat proves the park→reply→`rearmBoardId` detour contract.
- `human-sim-archived.mjs`: archived-thread chat answered via `reply_artifact_chat` with
  `discussionId` — the documented archived routing, now proven end-to-end.
- `ui-break-sweep.mjs` + `latency-profile.mjs`: same scaffold, so they ride the same route.

### Phase C — verify (rule 10)
`npm run build` + `npm test` (unit, ts, smoke, ui-smoke, all five human sims) +
`npm run test:human:sweep` → exit 0. Iterate until green. `scripts/smoke.mjs` and
`tests/api-status-matrix` keep their in-process Bridge — they ARE the integration layer for
the Bridge API itself; that is their subject, not a journey claim.

### Phase D — doctrine
- wiki (delegate wiki-librarian): `System/testing-observability.md` (human-sim layer now
  drives the real stdio MCP tool route), `tests/journeys.md` registry note, log lines.
- `.agents/learnings.md`: the surviving gap — deleting a preview harness is not the same as
  making the journeys take the real route; audit the *pathway*, not just the fixtures.
- `/plan-closeout` when green.

## Progress log
- 2026-07-09 — plan scaffolded after the review sweep; verdict recorded; implementation begins.
- 2026-07-09 — B1+B2 landed: `scripts/lib/mcp-client.mjs` (stdio JSON-RPC client), `sim-runner.mjs`
  spawns the built MCP server (cwd=scratch config, VIBR_HOME, VIBR_PORT=0, port-file discovery);
  all five sims converted to real tools/call orchestration. `onQueuedCommand` + stale
  diagnose-demo ref removed; `open_studio` gained `openBrowser` (parity with present_board);
  canonical diverge.json extended to 5 axes (the REAL tool refuses <5 — the fixture had been
  violating the product contract invisibly). Flagship now 23 steps incl. a LIVE intake-gate
  refusal, digest asserts, and the queued-chat → session_status → reply_artifact_chat round-trip;
  boardchat proves park→reply→rearm→submit-with-dial end to end; archived proves open_studio
  command delivery + discussionId-routed reply. Cross-process disk-read races fixed with short
  polls. Individually green: unit 287, ts, smoke, ui-smoke, all five human sims. journeys.md +
  learnings updated; full `npm test` + sweep + wiki reconcile in flight.
- 2026-07-09 — VERIFY COMPLETE, all green: `npm run build` ✓; full `npm test` exit 0 (unit 287,
  ts 17, smoke, ui-smoke, all FIVE human sims on the real MCP stdio route); break sweep
  `test:human:sweep` PASS — 414 controls, 507 gestures, 0 findings, zero unhandled crashes
  (runtime grew past 10 min with the 5-axes canonical board — run it un-capped). Doctrine done:
  journeys.md header + rows 1/2/3/3b/3c/3d/4b; learnings entry (audit the PATHWAY, not just the
  fixtures); test-engineer point 3 hardened structurally; diagnose-studio + devops-diagnostician
  de-staled (preview.js filter, preview-<date>.log); wiki reconciled by wiki-librarian
  (testing-observability ×3 sections, log line, wiki_reload). Ready for /plan-closeout.
