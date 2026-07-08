# Testing & Observability (AUTHORITATIVE)

## Test layers — all four green before any completion claim (rule 10)

| Layer | Where | Runs | Covers |
|---|---|---|---|
| Unit | `tests/*.test.mjs` (node:test, zero deps) | `npm run test:unit` | protocol schemas (defaults + rejections, incl. SeedIntake + judge-deck response fields + paletteColors + optional Theme.palette + optional SessionInfo.theme + SessionInfo.pinnedSlugs), session store (cache, brainstorm.md, artifacts, archive listing, resolveDir, togglePinned persist+reload), config, theme ingestion/shadowing, curated built-in palettes (`tests/config-themes.test.mjs` — 5 named hex colors per theme, values unique across palettes, theme accent included), feedback digest (labels, dial deltas, phase fields, finalize, back, model, commands, deck ranking/kills/duels, sudden-death finalize, palette ONLY-these-colors line), poster composer (`tests/poster.test.mjs` — winner label, lineage, notes, XML escaping, unknown-id throw), target repo (`tests/target-repo.test.mjs` — saveTargetRepo key preservation, per-thread override persistence + reload, `POST /api/target-repo` both scopes + honest 400s, thread-over-default resolution), canonical dataset (`tests/canonical-data.test.mjs` — every file under `tests/canonical/` proven via `schema.parse` + a stray-file walk that fails on any unregistered file), API status matrix (`tests/api-status-matrix.test.mjs` — real Bridge, 16 HTTP endpoints × every reachable status code + 4 WS behaviors — incl. `POST /api/pinned` (200 toggle + 404 unknown slug), bodies asserted key-for-key against `tests/canonical/api/`, endpoint×codes coverage table ending `ZERO UNPROVEN`) |
| Integration | `scripts/smoke.mjs` | `npm run smoke` | real Bridge on ephemeral port: WS hello/board push, HTTP respond, phase-field round-trip, disk cache, thread list/reload/resume, themes, model routing, UI command dispatch (queued + via-board, incl. reopen), artifacts (capture + `GET /api/artifact-svg` 200/404, serves live AND `_completed` threads), pins (`POST /api/pinned` toggle on/off, state reflects it, honest 404, survives disk reload), seed intake (sketch → `.seeds/`, bad image data URI → honest failure note), attachment persistence (valid data URI → savedPath + file on disk; malformed → no savedPath), paletteColors round-trip, new-brainstorm with attachments/model/palette seed notes, waitForCommand landing flow, `POST /api/themes` (writes the styles drop-in JSON; state palette reflects renamed + added colors), `POST /api/session-theme` (persists to session.json; unknown name → 400) |
| UI render | `scripts/ui-smoke.ts` (tsx + jsdom) | `npm run smoke:ui` | all six phase surfaces server-render with signature markers; JudgeDeck, WayfinderStrip (proposal pill), NewDiscussionPanel (chip "other", audience + constraints groups, Colors card, theme palette, "Add a color" affordance, "Scribble a seed" section, full composer), TriageGate sudden-death, TargetRepoPicker (unset + set), ArtifactFullscreen (the ONE unified viewer — option/artifact/live-board-onChange/read-only variants + pin toggle), WayfinderStrip pinned row; pure helpers `lib/deck` (applyDuel/adjacentDuels) + `lib/wayfinder` (proposeNextPhase) |
| Human sim | `scripts/human-sim.mjs` + shared `scripts/lib/cdp.mjs` (raw CDP, headless browser, frameworkless — repo's own `ws`, NO Playwright) | `npm run test:human` | the REAL built studio (`apps/studio/dist`) driven against a REAL Bridge on an ephemeral port through an 8-step user goal (load → compose brief → send → canonical board renders as survey → select option → elaborate → submit → captured artifact in wayfinder keeps → open it in the unified ArtifactFullscreen → 📌 pin it to the filmstrip row); crash-checked after EVERY step (root mounted + zero `Runtime.exceptionThrown` + zero page console errors + zero `STUDIO CLIENT ERROR` in `GET /api/logs`); honest SKIP (exit 0, loud `HUMAN SIM SKIP`, never a pass) when no chromium-family browser exists |

`npm test` = `test:unit && smoke && smoke:ui && test:human && test:human:archived` — human-sim
is now TWO gated journeys: `test:human` (the live 8-step goal) and `test:human:archived`
(`scripts/human-sim-archived.mjs` — seeds a `_completed/` thread on disk, opens it from the
Completed nav, and proves the captured-artifact chat replays READ-ONLY through the unified
`ArtifactFullscreen` viewer + the reopen controls are present + no pin toggle on archived).
Conventions:
- Unit tests import BUILT output (`dist/`) — build first; `node --test` needs the QUOTED
  glob `"tests/*.test.mjs"` (bare dirs don't glob on Windows).
- Temp dirs only (`vibr-test-` prefix in os.tmpdir); never touch `discussion`. Both browser
  harnesses are concurrency-safe (`fs.mkdtempSync` profile dirs + ephemeral bridge ports),
  so simultaneous `npm test` runs across sessions don't collide.
- Tests anchor to `tests/canonical/` (its README is the binding convention) — canonical
  files are schema-proven, never trusted: `tests/canonical-data.test.mjs` parses every file
  and a stray-file walk fails on any unregistered one.
- Features ship WITH tests at the lowest layer that catches their regression; new surfaces
  need a ui-smoke EXPECT entry. No mocks, no fake success — real Bridge, real fs, real zod.
- **On-demand deeper audit — Break sweep**: `npm run test:human:sweep`
  (`node scripts/ui-break-sweep.mjs`) is NOT gated on every `npm test` (a multi-minute
  audit; gating it on every rule-10 verify across concurrent dispatch loops would be
  disproportionate). Per phase surface it enumerates EVERY interactive control from the LIVE
  DOM and runs break gestures (rapid double-clicks, empty submits, 100k-char oversize input,
  hostile input — script tags/control chars/emoji/RTL — and a mid-flow reload + rehydration
  check), crash-checked after each; findings are recorded and the sweep CONTINUES, only an
  unmounted root / process death hard-fails. Vanished-mid-gesture controls are recorded
  `vanished (transient control)`, disabled controls `inert by design` — neither is a
  finding. Proven run: 7 surfaces, 404 controls, 486 gestures, 0 findings. Ends
  `BREAK SWEEP PASS`.

## Comprehensive human testing (operator mandate 2026-07-07)

Plan generation was skipping comprehensive human testing. Four requirements, binding on all
new test work — now MET by the landed harness:

1. **APIs**: every reachable status code tested and PROVEN; response data asserted against
   expectations — not just "200 came back". → `tests/api-status-matrix.test.mjs` (unit
   layer): real Bridge, 15 endpoints × every reachable code + 4 WS behaviors, bodies vs
   `tests/canonical/api/` (38 expected-body files, sentinel grammar for dynamic fields —
   `tests/canonical/api/README.md`); coverage table ends `ZERO UNPROVEN`.
2. **UIs**: simulated humans clicking through to accomplish their goal — iterate every
   button and every input, actively trying to break it. → `scripts/human-sim.mjs` (the
   fourth gated layer, 8-step goal flow) for the happy path + `scripts/ui-break-sweep.mjs`
   (on-demand `test:human:sweep`) for the break-everything audit.
3. **Canonical test data**: all tests anchor to `tests/canonical/` (its README is the
   convention). → `threads/`, `boards/` (6 per-phase), `responses/` (6 mechanic-exercising),
   `themes/`, `api/`; `tests/canonical-data.test.mjs` schema-proves every file + stray-file
   walk.
4. **Verifiable**: every test has a runnable command and observable output.

The harness has LANDED (plan `discussion/comprehensive-human-testing-2026-07-07/plan.md`,
phases canonical-data → api-status-matrix → human-sim-harness → ui-break-sweep →
gate-and-docs, all done; dispatcher `/dispatch-comprehensive-human-testing-next-phase`).
`npm run test:human` is the fourth gated layer (raw CDP, headless browser, frameworkless —
no mocks); `npm run test:human:sweep` is the on-demand deeper break-sweep audit. Both are
detailed in the layer table and conventions above.

Every scaffolded plan carries a mandatory human-verification phase —
`.claude/commands/create-dispatch-command.md` emits it; enforcement rules live in
`.claude/agents/test-engineer.md`.

## Observability

- **File logs**: `<discussionRoot>/.logs/mcp-<yyyy-mm-dd>.log` — every line
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
- **Token pipe delivery guarantee**: `Bridge.start()` writes
  `<discussionRoot>/.logs/bridge-port.json` (actual port + pid; last-started bridge wins);
  `scripts/pipe-progress.mjs` discovers the port from it (explicit `--port`/`VIBR_PORT`
  still win; 5199 fallback) and commits its token-delta cursor ONLY after the bridge
  confirmed delivery (`res.ok`) — a failed POST's delta rides on the next event. Root
  cause on record (lost-token-meter incident, 2026-07-07): port-conflict fallback + eager
  cursor commit silently lost ALL token events (no thread on disk had a `progress.jsonl`).
  Studio side: SessionActivity renders the Σ token badge even with an empty activity tail;
  an archived thread shows its Σ total in the archived banner.
- **Live ring**: last 500 lines in memory → `GET /api/logs` → studio Logs modal (Logs
  button, bottom-left of the left nav).
- **`GET /api/health`**: pid, port, startedAt, session id/dir, active board,
  awaiting-response, connected clients, studio-dist existence. First question, always.
  Semantics: `awaitingResponse` reflects the blocking `present_board` wait — it flips
  false after the tool timeout, so it is NOT board liveness. `activeBoard` becomes null
  only when a response is accepted; that is the signal a user actually submitted.
- **Diagnosis**: procedure `.claude/commands/diagnose-studio.md`; agent
  `devops-diagnostician` (evidence-first; most reports are a port-conflict ghost).
  Known signature: bridge log showing "studio connected" then "studio disconnected"
  within ~1s, repeatedly = client-side crash loop (before `POST /api/client-log` existed,
  that churn was the ONLY evidence of one).
