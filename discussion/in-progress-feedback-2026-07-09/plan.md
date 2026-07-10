# In-Progress Feedback — live status, artifact keep/kill, and the kill→regenerate loop

**Status:** open
**Goal:** After a chat request is submitted, the user continuously sees structured, real-time
status of what Claude Code is doing (persisted to the discussion folder, recallable on
reload). As artifacts stream in, the user can open any one fullscreen and render a
**keep** or **kill** verdict with a note; a kill removes the artifact, its slot shows a
live regeneration placeholder, and a replacement — guided by the killed option's
characteristic plus the user's note — streams in asynchronously while sibling artifacts
keep generating. Done = all phases verified per rule 10 including a live-human journey
(`npm run test:human` + `:sweep`) proving the kill→replace cycle end-to-end against a real
Claude Code session.
**Source:** operator notes 2026-07-09 (this folder's original plan.md, preserved verbatim below).

## Operator notes (verbatim source — every phase traces here)

1. We need more feedback after the chat request is submitted and we build some scaffolding for this already
2. Review the codebase as built and the mcp communications and the app and suggest ways to improve the responsive feel depending on methodology to stream in results
3. Ensure existing scaffolding is piped into mcp to provide real time status updates to the ui surface for claude code procedures and use structured data so we can expand on this and ensure persistance to the discussion folder
4. As an artifact streams in the user could click to open the full screen view with a keep or kill option and the notes could be used to cycle feedback to the loop
5. If kill was used a new option would be generated in place of the killed option and the characteristic + note would guide the generation of the new artifact
6. This needs to be tested with a live human journey against a live claude code session to ensure the artifact is elimated while subseqent artifacts are asynchronously generated
7. Make updates to code and the agentic layer to improve end user experience

## Review findings (note 2 — codebase as built, 2026-07-09)

What already exists (do not rebuild):
- **Progress pipe is live end-to-end**: `scripts/pipe-progress.mjs` (hook + CLI modes, wired
  in `.claude/settings.json`) → `POST /api/progress` → `SessionStore.recordProgress` →
  `progress.jsonl` in the thread dir + WS `progress` broadcast → `SessionActivity.tsx`.
  Token deltas + per-sink attribution (`TokenSink`) already structured and persisted.
- **Artifact stream-in is live**: `capture_artifact` → `announceArtifact` → WS `artifact`
  broadcast → shelf appends in real time. Fullscreen viewer (`ArtifactFullscreen`) already
  has zoom/pan, Notes (persisted via `POST /api/artifact-notes`), Chat dock, Annotate, Pin.
- **Keep/kill exists at BOARD level only** (`triage`, `deckVerdicts` in `BoardResponse`),
  interpreted by `buildFeedbackDigest` (`apps/mcp/src/feedback.ts`).
- **The dispatch template for kill→regenerate already exists**: the artifact-chat change
  path (`POST /api/artifact-chat` → `dispatchCommand` → `/artifact-chat` → svg-artisan →
  `capture_artifact {revises}` → `reply_artifact_chat`) is the exact pattern to mirror.

Gaps (the build):
- `ProgressEvent` is mechanical-label-only — no `stage`/`artifactSlug`/`optionId`/counts,
  so status can't be correlated to a specific streaming artifact ("generating 3 of 6").
- `Artifact` has **no verdict field**; no `/api/artifact-verdict` endpoint; no keep/kill
  controls in the fullscreen viewer.
- No in-progress/placeholder artifact concept — nothing occupies the killed slot while the
  replacement generates.
- Captured-artifact notes/verdicts never cycle into `buildFeedbackDigest` — the fullscreen
  feedback loop is open-circuit.
- No agentic-layer owner for a kill verdict (a surface Claude is never told to invoke is a
  brick — mandatory wiring phase below).

Responsive-feel methodology (recommendation adopted by the phases): keep the existing
deterministic pipe + WS broadcast as the single realtime channel (no SSE/polling second
channel); make responsiveness come from **granularity** — structured per-artifact stage
events emitted at generation boundaries, placeholder slots that render instantly on kill,
and optimistic UI on verdict clicks reconciled by the `artifact` broadcast.

## Phases

| # | Phase | Goal + exit criteria (intent, no code) | Owner | Status |
|---|---|---|---|---|
| 1 | protocol-structured-status | Protocol gains structured in-progress vocabulary: progress events can carry a stage + the artifact/option/board they concern + N-of-M counts; artifacts can carry a keep/kill verdict + verdict note + replacement lineage; WS envelope gains the pending-replacement announcement. Pipe emits the structured fields (hook + CLI). Exit: `npm run build` + `npm test` green with new unit tests asserting the schema literals round-trip; no consumer redeclares a shape (rule 5). | inline + test-engineer | done |
| 2 | bridge-store-verdict | Verdicts persist and broadcast: an artifact-verdict endpoint records keep/kill + note to the artifact's sidecar in the thread dir (recallable on reload), broadcasts the updated artifact, and on kill dispatches the regeneration command carrying the killed option's characteristic + user note, announcing a pending replacement slot. Structured progress events persist to the thread dir and replay on reload. Exit: `npm test` green incl. session-store persist/reload tests and endpoint tests for every reachable status code. | inline + test-engineer | todo |
| 3 | studio-keep-kill | Fullscreen viewer gains Keep/Kill controls (with note capture on kill); shelf shows keep badge, removes killed artifacts, and renders a live placeholder in the killed slot that fills when the replacement streams in; session activity renders structured stage lines (e.g. "generating option 3 of 6") instead of only mechanical labels. Exit: `npm run build` green; states reachable in the real studio (proven fully in phase 5). | inline | todo |
| 4 | agentic-wiring | The kill verdict has ONE owner in the `.claude` layer: a command the bridge dispatches on kill routes regeneration to svg-artisan with the characteristic + note as the brief and captures the replacement with lineage provenance; keep-notes and verdicts cycle into the feedback digest for the next round; orchestrator/run-brainstorm/artifact-chat docs reference the new mechanic; supported adapter layers (.github/.codex) reconciled in the same cycle (rule 11). Exit: `npm test` green incl. feedback-digest tests proving verdict + note inclusion; command file names only real tools/endpoints. | inline (commands) + test-engineer | todo |
| 5 | human-verification | REAL-path proof (operator mandate): API — every reachable status code of the verdict endpoint with bodies asserted against `tests/canonical/`; UI — human-sim journey against real bridge + built studio + real browser + live Claude Code session: artifact streams in → fullscreen → kill with note → artifact visibly eliminated → placeholder visible → replacement streams into the slot WHILE sibling artifacts continue generating asynchronously; plus break-sweep over every new control. Journey predicted then audited additively in `tests/journeys.md`. Exit: `npm run test:human` (+ `:sweep`) green on the new journey. | test-engineer | todo |
| 6 | docs-and-wiki | Docs move with the product (rule 12): user-guide covers keep/kill + live status; interface-coverage gains owner rows for the new mechanic; system-architecture endpoint list + testing-observability updated; one log.md line per page; wiki MCP index reloaded. Exit: wiki pages updated + `wiki_reload` run + log lines appended. | wiki-librarian | todo |

## Progress log (append-only — every tick writes one line)
- 2026-07-09 21:05 — protocol-structured-status: PROGRESS_STAGES (generating/revising/replacing) + ProgressEvent stage/artifactSlug/optionId/boardId/sequence; ArtifactSchema verdict/verdictNote/verdictAt/replacedBy + provenance.replaces; PendingReplacementSchema + `artifact-pending` WS envelope + StudioState.pendingReplacements (bridge emits [], studio reducer upserts/resolves); pipe CLI --stage/--artifact/--option/--board/--step/--of + hook-boundary stage; /api/progress inbound validator extended (bogus stage → 400). Tests: protocol round-trips, pipe wire-capture (real server + child process), api matrix + canonical fixtures (state-200 gained pendingReplacements, progress-400-bad-stage, progress-structured). verify: npm run build → green; npm test full chain → 254 unit + ts 13 + smoke + ui-smoke + 5 human sims ALL PASS; re-ran test:unit post-merge → fail 0. commit: swept into concurrent session's 6d108e5 ("all changes for cursor before limit") — no remaining delta; this tick's plan update commits separately.
