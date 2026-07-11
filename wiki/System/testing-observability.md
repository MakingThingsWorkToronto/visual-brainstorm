# Testing & Observability (AUTHORITATIVE)

## Test layers — all four green before any completion claim (rule 10)

| Layer | Where | Runs | Covers |
|---|---|---|---|
| Unit | `tests/*.test.mjs` (node:test, zero deps) | `npm run test:unit` | protocol schemas (defaults + rejections, incl. SeedIntake + judge-deck response fields + paletteColors + optional Theme.palette + optional SessionInfo.theme + SessionInfo.pinnedSlugs + IntakeLogEntry discriminated union), session store (cache, brainstorm.md, artifacts, archive listing, resolveDir, togglePinned persist+reload, intake-log.json persist+reload), config, theme ingestion/shadowing, curated built-in palettes (`tests/config-themes.test.mjs` — 5 named hex colors per theme, values unique across palettes, theme accent included), Copilot adapter discovery consistency (`tests/copilot-adapter.test.mjs` — authoritative registry ↔ `.github/agentic-surface-registry.json` ↔ on-disk prompt/agent wrappers, mapped prompt frontmatter, no stray wrappers), Copilot MCP parity plus real stdio initialize handshakes (`tests/copilot-mcp.test.mjs` — parity guard plus both `.vscode/mcp.json` commands negotiate MCP `initialize`), Codex adapter consistency (`tests/codex-adapter.test.mjs` — `.codex` MCP config cwd, hook commands, agent roster, and `.agents/skills` mirror), Cursor adapter consistency (`tests/cursor-adapter.test.mjs` — `.cursor/mcp.json` starts both stdio servers from the workspace root, hooks free of Claude-specific env vars, command wrappers mapped to the authoritative registry via its cursor exclusions, agent roster mirror, plus real stdio `initialize` + `tools/list` inventory checks on both servers), feedback digest (labels, dial deltas, phase fields, finalize, back, model, commands, deck ranking/kills/duels, sudden-death finalize, palette ONLY-these-colors line), poster composer (`tests/poster.test.mjs` — winner label, lineage, notes, XML escaping, unknown-id throw), target repo (`tests/target-repo.test.mjs` — saveTargetRepo key preservation, per-thread override persistence + reload, `POST /api/target-repo` both scopes + honest 400s, thread-over-default resolution), canonical dataset (`tests/canonical-data.test.mjs` — every file under `tests/canonical/` proven via `schema.parse` + a stray-file walk that fails on any unregistered file), API status matrix (`tests/api-status-matrix.test.mjs` — real Bridge, 16 HTTP endpoints × every reachable status code + 4 WS behaviors — incl. `POST /api/pinned` (200 toggle + 404 unknown slug), bodies asserted key-for-key against `tests/canonical/api/`, endpoint×codes coverage table ending `ZERO UNPROVEN`), intake log (`tests/intake-log.test.mjs` — 6 real-bridge tests: concierge answer → entry + WS broadcast + disk reload; timeout → no entry; gallery pick entry with roster; brief entry incl. rawBrief/ids + /api/discussions/:id replay; a brief over a thread WITH rounds is NOT logged locally — it travels with the command and the fresh brainstorm's own landing loop records it; a corrupt intake-log entry skips alone, the tail of the history survives reload) |
| Unit (geometry) | `tests/*.test.ts` (node:test **via `tsx`**) | `npm run test:ts` | pure, DOM-free logic that jsdom/browser layers can't reach — the wayfinding-pulse geometry in `apps/studio/src/lib/guidePath.ts` (`tests/guide-path.test.ts`): rounded-rect perimeter length (sharp + rounded corners), `atLength` wrap, `nearestLength` closest-point, and `buildTimeline` nav→step→input sequencing + link continuity + 2-lap loop closure + `busy`→hub-only. This is how an animation's MATH is proven where its pixels can't be (no rAF/`getBoundingClientRect` in jsdom) |
| Integration | `scripts/smoke.mjs` | `npm run smoke` | real Bridge on ephemeral port: WS hello/board push, HTTP respond, phase-field round-trip, disk cache, thread list/reload/resume, themes, model routing, UI command dispatch (queued + via-board, incl. reopen), artifacts (capture + `GET /api/artifact-svg` 200/404, serves live AND `_completed` threads), pins (`POST /api/pinned` toggle on/off, state reflects it, honest 404, survives disk reload), seed intake (sketch → `.seeds/`, bad image data URI → honest failure note), attachment persistence (valid data URI → savedPath + file on disk; malformed → no savedPath), paletteColors round-trip, new-brainstorm with attachments/model/palette seed notes, waitForCommand landing flow, `POST /api/themes` (writes the styles drop-in JSON; state palette reflects renamed + added colors), `POST /api/session-theme` (persists to session.json; unknown name → 400) |
| UI render | `scripts/ui-smoke.ts` (tsx + jsdom) | `npm run smoke:ui` | all six phase surfaces server-render with signature markers; JudgeDeck, WayfinderStrip (proposal pill), NewDiscussionPanel (chip "other", audience + constraints groups, Colors card, theme palette, "Add a color" affordance, "Scribble a seed" section, full composer), TriageGate sudden-death, TargetRepoPicker (unset + set), ArtifactFullscreen (the ONE unified viewer — option/artifact/live-board-onChange/read-only variants + pin toggle), WayfinderStrip pinned row; BoardSurvey exposes the wayfinding-pulse `data-guide` tags (`step` phase mechanic + `input` composer) so the guide targets are proven on the REAL render path; pure helpers `lib/deck` (applyDuel/adjacentDuels) + `lib/wayfinder` (proposeNextPhase) |
| Human sim | `scripts/human-sim.mjs` (+ `*-archived`, `-livechat`, `-boardchat`, `-mindchat`, `-killreplace`) + shared `scripts/lib/sim-runner.mjs` (spawns built stdio MCP server `apps/mcp/dist/index.js` with scratch VIBR_HOME + ephemeral VIBR_PORT) + `scripts/lib/mcp-client.mjs` (newline-delimited JSON-RPC tool caller; studio URL discovered from bridge `.logs/bridge-port.json`) | `npm run test:human` | SIX gated journeys under real MCP stdio layer: (1) primary 8-step goal (load → compose brief → send → canonical board renders as survey → select option → elaborate → submit → captured artifact in wayfinder keeps → open ArtifactFullscreen → 📌 pin to filmstrip); (2) `test:human:archived` — seeds `_completed/` thread, resumes from Completed nav, proves artifact-chat on archived; (3) `test:human:livechat` — live artifact-chat round-trip; (4) `test:human:boardchat` — live-board option chat non-destructive (dials + selections persist); (5) `test:human:mindchat` — live mind map (tree.md edit, maximize flush to draft.json + "Live tree" heading, chat under mindmap snapshot); (6) `test:human:killreplace` — open artifact fullscreen → click Kill → fill note form → observe pending-replacement shimmer → wait for replace-artifact command routed + SVG replacement captured → slot renders new artifact (10 steps incl. break-sweep + async-sibling proof of concurrent pending). `test:human` also proves intake persistence in-run (step "answered intake STAYS in the chat", journeys.md row 17): in the gap after the concierge answer, the brief/question/answer are visibly in frame, no "Send & iterate" button, the intake-chip is present, and the intake-preparing shimmer HOLDS the gap — the timeline never snaps back to the New Discussion panel. MCP tools proven LIVE under test: intake lock (present_board refuses "Intake incomplete" before gallery pick), option/axes validation (present_board refuses boards with <5 axes per tool boundary), feedbackDigest assertion (including kill→pending→replaced chains), park→reply_artifact_chat→rearmBoardId artifact-chat contract, intake log persistence + WS broadcast. Crash-checked after every step (root mounted + zero exceptionThrown + zero page console errors + zero STUDIO CLIENT ERROR); honest SKIP when no chromium-family browser. Canonical board fixture satisfies tool contract (now 5 axes, was 2). Verdict/pending/replaced canonical fixtures: `tests/canonical/api/artifact-verdict-200-keep.json` / `artifact-verdict-200-kill.json` / `artifact-verdict-400.json` / `artifact-verdict-404.json` + `ws-artifact-pending.json`; `tests/canonical/artifacts/` holds kept/killed-with-replacement/killed-pending/unjudged sidecar samples. |

`npm test` = `test:unit && test:ts && smoke && smoke:ui && test:human && test:human:archived && test:human:livechat && test:human:boardchat && test:human:mindchat && test:human:killreplace` — `test:ts` is the tsx-run geometry layer (above); human-sim is now SIX gated journeys: `test:human` (the live 8-step goal), `test:human:archived` (`scripts/human-sim-archived.mjs` — seeds a `_completed/` thread on disk, opens it from the Completed nav, and proves the interactive artifact chat works on archived threads: a question records into the thread in place, answered live without reopen), `test:human:livechat` (live artifact-chat round-trip on a running thread), `test:human:boardchat` (proves live-board option chat is non-destructive: dials and selections persist while Claude answers questions about the board), `test:human:mindchat` (proves live mind map: model-legible `round-NN/tree.md`, a REAL mind-elixir edit before maximizing — waiting for the LAZY engine instance, never sampling once — maximize flushing the live tree to `draft.json` + the `tree.md` "Live tree" heading, the mindmap-aware chat hint in-page, and chat persisting under the mindmap snapshot artifact), and `test:human:killreplace` (artifact kill→replace: open fullscreen → click Kill → fill note → observe pending-replacement shimmer → capture replacement → slot renders new artifact).
Conventions:
- Unit tests import BUILT output (`dist/`) — build first; `node --test` needs the QUOTED
  glob `"tests/*.test.mjs"` (bare dirs don't glob on Windows).
- Temp dirs only (`vibr-test-` prefix in os.tmpdir); never touch `discussion`. Both browser
  harnesses are concurrency-safe (`fs.mkdtempSync` profile dirs + ephemeral bridge ports),
  so simultaneous `npm test` runs across sessions don't collide.
- Copilot MCP verification is split honestly: `tests/copilot-adapter.test.mjs` proves the
  authoritative registry -> Copilot adapter registry -> prompt/agent wrapper chain.
  `tests/copilot-mcp.test.mjs` runs the parity guard and, for every configured server in
  `.vscode/mcp.json` and `.github/mcp.json`, uses real stdio `initialize` ->
  `notifications/initialized` -> `tools/list` discovery and asserts the exact tool inventory.
  It starts the hosted product server with `VIBR_COPILOT_HOSTED=1` and actively calls
  `open_studio`, `ask_concierge`, `present_gallery`, and `present_board`; each must return
  `{ status: "unsupported-host" }` before bridge startup. Native hook-wrapper behavior is
  exercised for `{}`, `null`, malformed JSON, and a normal edit payload. After `npm run build`,
  the cloud setup workflow runs `npm run check:copilot-parity`,
  `node --test tests/copilot-mcp.test.mjs`, and `node --test tests/copilot-adapter.test.mjs` in
  that order. Its push and pull-request filters include `.github/agentic-surface-registry.json`,
  `.github/prompts/**`, and `tests/copilot-adapter.test.mjs` as parity-owned paths.
- Copilot host checks remain manual: VS Code workspace trust, start/discovery, MCP tools, and `/`
  menu behavior; GitHub organization policy and repository MCP-settings/custom-agent acceptance;
  and GitHub runner working-directory and host-service behavior. The repo makes no automated
  claim for these host-managed conditions.
- Codex adapter verification is local and deterministic: the repo proves the `.codex` config,
  hooks, custom-agent roster, and `.agents/skills` mirror. Whether a particular Codex client
  has trusted the project and loaded project-local config is a client state check (`/mcp`,
  active agents/skills), not something the repo can assert offline.
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
- **Shared harness infrastructure**: the five human-sim scripts share `scripts/lib/sim-runner.mjs`
  (scaffold: spawn built stdio MCP server with scratch VIBR_HOME + ephemeral VIBR_PORT + discover
  studio URL from bridge `.logs/bridge-port.json`; browser discovery/SKIP, checkpoint/step,
  failure screenshot, teardown, launch retry); `scripts/lib/mcp-client.mjs` handles newline-delimited
  JSON-RPC initialization/tool-calling/notifications (hardening lands once). The unit layer shares
  `tests/lib/bridge-harness.mjs` (startBridge/postJson/getState/getHealth/tmp — one bridge-boot
  spelling).  **Layering doctrine**: `scripts/smoke.mjs`, `tests/api-status-matrix.test.mjs`,
  `scripts/ui-break-sweep.mjs`, and `scripts/latency-profile.mjs` legitimately construct the Bridge
  in-process — the Bridge is their SUBJECT (testing its HTTP routes, response bodies, WS envelopes,
  and performance); journey proofs never may (rule 10).

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
`npm run test:human` is the fourth gated layer (spawns real stdio MCP server, plays orchestrator
with real MCP tool calls via newline-delimited JSON-RPC, headless browser, frameworkless —
no mocks, no in-process Bridge construction); the MCP tool layer is now under journey test,
proving live intake locks, option/axes validation, and the artifact-chat contract end-to-end.
`npm run test:human:sweep` is the on-demand deeper break-sweep audit. Both are detailed in the
layer table and conventions above.

Every scaffolded plan carries a mandatory human-verification phase —
`.claude/commands/create-dispatch-command.md` emits it; enforcement rules live in
`.claude/agents/test-engineer.md`.

**Proving a transient in-flight UI state** (e.g. a "sending…" reveal that exists only for the
duration of a request): do not race the round-trip — on loopback it is ~ms. PAUSE the
triggering request over CDP so the real app renders the real state under a real request, then
release it: `Fetch.enable({patterns:[{urlPattern:'*/api/respond*', requestStage:'Request'}]})`,
capture `Fetch.requestPaused` to grab the `requestId`, `Page.captureScreenshot`, then
`Fetch.continueRequest`. This is honest proof (rule 10) — nothing is faked, the request truly
flew — and it generalises to any optimistic/pending surface.

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
  **Token-delta idempotency (2026-07-09):** every delta now carries a `tokenCursor` claim
  (protocol `ProgressEvent` field: cursor id = session id + generation + cumulative transcript
  totals the delta ran up to). `SessionStore.recordProgress` keeps a per-(id, gen) high-water
  mark and clamps any overlap before recording — this dedupes both concurrent-hook races
  (e.g. Stop + SubagentStop firing together, each reading the same prior cursor state) and
  slow-accept re-posts (bridge accept past the 1.5s abort being re-covered by the next event).
  No locking; pipe stays a plain read/post (hook safety intact — always exit 0). A transcript
  shrink (compaction) bumps the cursor generation so the high-water mark resets instead of
  eating real usage. The ledger is rebuilt from persisted events when `SessionStore.open()`
  loads a thread, so live and reloaded deduplication agree. Proven end-to-end (real pipe
  processes → real Bridge → real store) in `tests/pipe-progress.test.mjs` (race / slow-accept /
  compaction scenarios) and unit-level in `tests/session-store.test.mjs`.
  Studio side: SessionActivity renders the Σ token badge even with an empty activity tail;
  an archived thread shows its Σ total in the archived banner.
- **Structured progress events (studio status line)**: `ProgressEvent` optional fields `stage` (one of `generating`, `revising`, `replacing`), `artifactSlug`, `optionId`, `boardId`, `sequence {current, total}` enable the studio to render live "generating 3 of 6" / "revising option-a" / "replacing killed-artifact-x" status lines. These fields are deterministic (set by the tooling, never by a model); honesty guardrail keeps status true to the actual work in flight.
- **Per-sink token accounting (token economy view)**: the studio presents WHERE tokens go,
  not just a running total. `ProgressEvent.category` (a `TokenSink`: `generation` | `tweak` |
  `intake` | `orchestration` | `poster`) is set two ways — a **boundary** event (a tool
  label posted by `pipe-progress.mjs`: `present_board`→generation, `present_gallery`/
  `ask_concierge`→intake, `compose_poster`→poster, **PreToolUse `Agent`/`Task` with
  `subagent_type: svg-artisan`→generation, or →tweak when the delegation brief carries the
  deterministic MUTATE marker** — so the artisan's SubagentStop delta lands in its real
  sink, not orchestration; or any harness via CLI `--category`)
  DECLARES the current sink; the NEXT token-bearing turn-end event (the blind Stop-hook
  delta) inherits it, then the label is CONSUMED so it attributes exactly that one turn —
  later uncategorized turns fold into `orchestration`. `pipe-progress.mjs` --category validation
  reads protocol `TOKEN_SINKS` via guarded dynamic import (rule 5; local mirror only when dist
  is unbuilt — the hook can never fail). Honesty (rule 6): the token counts are the REAL measured
  deltas; only the sink attribution is a documented heuristic ("what the turn was doing"). Subagent
  (sidechain) usage recorded in the session transcript DOES ride the deltas — the delegation boundary
  above bins it; only usage that never reaches the transcript at all is invisible, disclosed not faked.
  The store owns attribution (`SessionStore.recordProgress` stamps, `tokensBySink()` reduces), the
  bridge ships `StudioState.tokensBySink`, and `SessionActivity` renders the labeled bars.
  **Attribution edges & sidebar/meter parity (2026-07-09):** `sumTokensFile` (sidebar totals in
  `SessionStore.list()`) now skips exactly the same schema-invalid lines that `open()` skips — a
  corrupt/foreign `progress.jsonl` line can no longer count in the sidebar but not the opened thread's
  meter. Attribution heuristic pinned: when two boundary labels appear before one delta, the LAST
  label wins (test-pinned: `tests/session-store.test.mjs`). The studio's client-side live increment
  is now a pure proven reducer (`apps/studio/src/lib/progressTokens.ts`, `tests/progress-tokens.test.ts`)
  mirroring the server rule (uncategorized → orchestration). The old "measurement noise" caveat in
  `discussion/_completed/token-economy-2026-07-07/baseline.md` § Known limits is superseded — the
  noise is gone (rule 6 honest).
  The live-session A/B (the token-economy plan's outstanding future verification) has a
  written baseline + runnable procedure:
  `discussion/_completed/token-economy-2026-07-07/baseline.md`; its predicted human journey
  is `tests/journeys.md` row 9 (component + attribution proofs DONE, live end-to-end OWED).
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
