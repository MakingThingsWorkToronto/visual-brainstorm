# Testing & Observability (AUTHORITATIVE)

## Test layers — all three green before any completion claim (rule 10)

| Layer | Where | Runs | Covers |
|---|---|---|---|
| Unit | `tests/*.test.mjs` (node:test, zero deps) | `npm run test:unit` | protocol schemas (defaults + rejections, incl. SeedIntake + judge-deck response fields + paletteColors + optional Theme.palette + optional SessionInfo.theme), session store (cache, brainstorm.md, artifacts, archive listing, resolveDir), config, theme ingestion/shadowing, curated built-in palettes (`tests/config-themes.test.mjs` — 5 named hex colors per theme, values unique across palettes, theme accent included), feedback digest (labels, dial deltas, phase fields, finalize, back, model, commands, deck ranking/kills/duels, sudden-death finalize, palette ONLY-these-colors line), poster composer (`tests/poster.test.mjs` — winner label, lineage, notes, XML escaping, unknown-id throw), target repo (`tests/target-repo.test.mjs` — saveTargetRepo key preservation, per-thread override persistence + reload, `POST /api/target-repo` both scopes + honest 400s, thread-over-default resolution) |
| Integration | `scripts/smoke.mjs` | `npm run smoke` | real Bridge on ephemeral port: WS hello/board push, HTTP respond, phase-field round-trip, disk cache, thread list/reload/resume, themes, model routing, UI command dispatch (queued + via-board), artifacts (capture + `GET /api/artifact-svg` 200/404), seed intake (sketch → `.seeds/`, bad image data URI → honest failure note), attachment persistence (valid data URI → savedPath + file on disk; malformed → no savedPath), paletteColors round-trip, new-brainstorm with attachments/model/palette seed notes, waitForCommand landing flow, `POST /api/themes` (writes the styles drop-in JSON; state palette reflects renamed + added colors), `POST /api/session-theme` (persists to session.json; unknown name → 400) |
| UI render | `scripts/ui-smoke.ts` (tsx + jsdom) | `npm run smoke:ui` | all six phase surfaces server-render with signature markers; JudgeDeck, WayfinderStrip (proposal pill), NewDiscussionPanel (chip "other", audience + constraints groups, Colors card, theme palette, "Add a color" affordance, "Scribble a seed" section, full composer), TriageGate sudden-death, TargetRepoPicker (unset + set), PreviewModal (tags + editable note, read-only variant); pure helpers `lib/deck` (applyDuel/adjacentDuels) + `lib/wayfinder` (proposeNextPhase) |

`npm test` = all three. Conventions:
- Unit tests import BUILT output (`dist/`) — build first; `node --test` needs the QUOTED
  glob `"tests/*.test.mjs"` (bare dirs don't glob on Windows).
- Temp dirs only (`vibr-test-` prefix in os.tmpdir); never touch `discussion`.
- Features ship WITH tests at the lowest layer that catches their regression; new surfaces
  need a ui-smoke EXPECT entry. No mocks, no fake success — real Bridge, real fs, real zod.
- Manual eyeballing: `npm run preview [phase]` (fixtures only).

## Comprehensive human testing (operator mandate 2026-07-07)

Plan generation was skipping comprehensive human testing. Four requirements, binding on all
new test work:

1. **APIs**: every reachable status code tested and PROVEN; response data asserted against
   expectations — not just "200 came back".
2. **UIs**: simulated humans clicking through to accomplish their goal — iterate every
   button and every input, actively trying to break it.
3. **Canonical test data**: all tests anchor to `tests/canonical/` (its README is the
   convention).
4. **Verifiable**: every test has a runnable command and observable output.

The human-simulation layer (headless browser + raw CDP, frameworkless — no mocks, per the
conventions above) is being built by
`discussion/comprehensive-human-testing-2026-07-07/plan.md` (phases: canonical-data,
api-status-matrix, human-sim-harness, ui-break-sweep, gate-and-docs; dispatcher
`/dispatch-comprehensive-human-testing-next-phase`). Until that harness lands, the CDP pass
is scripted by hand — never skipped. The layer table above stays THREE layers until the
plan's gate-and-docs phase wires the fourth; do not treat it as existing before then.

Every scaffolded plan carries a mandatory human-verification phase —
`.claude/commands/create-dispatch-command.md` emits it; enforcement rules live in
`.claude/agents/test-engineer.md`.

## Observability

- **File logs**: `<discussionRoot>/.logs/{mcp,preview}-<yyyy-mm-dd>.log` — every line
  timestamped + pid-tagged; events: startup/config, port conflicts (with holder pid),
  boards presented (incl. connected-client count), response summaries, WS connects,
  UI commands, `FATAL` crash stacks (uncaughtException/unhandledRejection handlers),
  studio client errors (below).
- **Client errors reach the server log** (blank pages are never evidence-free): the studio
  installs global `error`/`unhandledrejection` handlers plus a React `CrashBoundary`
  (`apps/studio/src/lib/client-log.ts`, `apps/studio/src/components/CrashPanel.tsx`).
  Uncaught client errors POST to the bridge's `POST /api/client-log` (zod-validated, 32k
  body cap; client side dedupes and caps at 20 per session, fire-and-forget so an old
  bridge without the endpoint never cascades) and land in the SAME FileLog ring served at
  `GET /api/logs`, prefixed `STUDIO CLIENT ERROR [source]:`. A render crash shows a visible
  crash panel (message + stack + reload button) instead of an unmounted blank page.
- **Live ring**: last 500 lines in memory → `GET /api/logs` → studio Logs modal (Logs
  button, bottom-left of the left nav).
- **`GET /api/health`**: pid, port, startedAt, engine, session id/dir, active board,
  awaiting-response, connected clients, studio-dist existence. First question, always.
  Semantics: `awaitingResponse` reflects the blocking `present_board` wait — it flips
  false after the tool timeout, so it is NOT board liveness. `activeBoard` becomes null
  only when a response is accepted; that is the signal a user actually submitted.
- **Diagnosis**: procedure `.claude/commands/diagnose-studio.md`; agent
  `devops-diagnostician` (evidence-first; most reports are a port-conflict ghost).
  Known signature: bridge log showing "studio connected" then "studio disconnected"
  within ~1s, repeatedly = client-side crash loop (before `POST /api/client-log` existed,
  that churn was the ONLY evidence of one).
