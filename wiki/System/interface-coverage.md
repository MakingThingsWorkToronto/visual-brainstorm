# Interface Coverage — task ownership + persistence recall

Authoritative answer to the operator mandate (discussion/askaquestion-2026-07-06, phase 6):
every interface task has exactly one owner, and every orchestrator↔UI message is recallable
from disk. Audited against `apps/mcp/src/bridge-server.ts`, `index.ts`, `session-store.ts`,
`scripts/pipe-progress.mjs`, `.claude/settings.json`, and the command/agent files named
below. Details of each mechanic live in `wiki/Requirements/interaction-protocol.md`; roster
in `wiki/System/agents.md`. Law: the orchestrator ORCHESTRATES — it routes, interprets, and
replies; generation, diagnosis, tests, and wiki work are always delegated (CLAUDE.md rule 11).

## Table 1 — Interface task → owner

| # | Interface task | UI surface / trigger | Owner | Orchestrator inline? |
|---|---|---|---|---|
| 1 | Start/resume a brainstorm; New Discussion panel; bare `/run-brainstorm` | panel submit → `new-brainstorm` command; `open_studio` landing | agent **`brainstorm-orchestrator`** via `.claude/commands/run-brainstorm.md` | YES — orchestration is never delegated |
| 2 | Board-response mechanic bundle: selection, per-option notes, remix pairs, axis dials, elaboration, triage, mutations, flaws, positions/clusters/gapNotes, deckVerdicts, duelResults, ranking, requestedPhase, Back | all board surfaces + composer; delivered as `feedbackDigest` in the `present_board` result | agent **`brainstorm-orchestrator`** via `/run-brainstorm` steps 4–6 + `.claude/skills/brainstorm-phases` | Interpretation YES (that IS orchestration); the generation it triggers → row 3 |
| 3 | Option/round SVG generation + model routing (`BoardResponse.model`, new-brainstorm `model`) | More Tools (+) model picker; every next-round build | agent **`svg-artisan`** (model override applies) — always delegated | NO |
| 4 | Artifact chat — question | fullscreen artifact panel, OR a previous round's option preview (synthetic `option:<boardId>:<optionId>` slug) → `POST /api/artifact-chat` | general subagent via `.claude/commands/artifact-chat.md` | NO — orchestrator only routes + `reply_artifact_chat` |
| 5 | Artifact chat — change request | same | agent **`svg-artisan`** via `/artifact-chat`; delivered as `capture_artifact` with `revises` (option chats: NEW artifact with boardId/optionIds provenance) + `reply_artifact_chat` | NO |
| 5b | Fullscreen viewer consolidation (one surface for all artifacts/options) | captured keeps, pinned artifacts, previous-round options, live board option previews → click to open `ArtifactFullscreen` (zoom/pan/pinch SVG, Notes panel ± Save, optional Chat panel) | `ArtifactFullscreen` component (`apps/studio/src/components/ArtifactFullscreen.tsx`) — consolidates old PreviewModal + ArtifactChat; handles all four click paths inline | n/a (UI component) |
| 5c | Pin artifact to filmstrip (disk-backed per thread) | 📌 toggle in fullscreen viewer header (live captured artifacts only) → `POST /api/pinned {slug}` | bridge `SessionStore.togglePinned(slug)` rewrites `session.json`, broadcasts hello; `WayfinderStrip` displays "📌 pinned" row | n/a (deterministic) |
| 6 | Plan closeout | More Tools → Plan closeout; Finalize & close out; `finalize` response | `.claude/commands/plan-closeout.md` | Runs the procedure; step 5 (wiki) → **`wiki-librarian`** |
| 7 | Skill discovery/ingestion | More Tools → Discover skills | `.claude/commands/discover-skills.md` | Runs the interactive procedure |
| 8 | Decision poster on finalize | `finalOptionId` set → after `capture_artifact` | `compose_poster` MCP tool — DETERMINISTIC, no model | n/a (tool call only) |
| 9 | Seeds — all four kinds (text \| sketch \| image \| voice) | New Discussion panel intake → `POST /api/command` | bridge `persistSeed` (deterministic) → digest note; orchestrator Reads the saved file (`/run-brainstorm` step 1). An annotated-photo **sketch** (photo + marks) persists as a traversable `.seeds/seed-<stamp>/` folder (composite.png + photo.png + scribble.svg + scribble.json + README.md) and routes to `/read-scribble` | Persistence never touches a model |
| 10 | Composer attachments (Attach file / Take a photo) | More Tools (+) → chips under the reply box | bridge `persistAttachment` (deterministic); orchestrator Reads each `savedPath` (`/run-brainstorm` step 4) | Persistence never touches a model |
| 11 | Palette pick (Colors, by theme) | More Tools (+) Colors / panel Colors card | deterministic ONLY-these-colors digest line; honored during generation by row 3 | NO generation inline |
| 12 | Theme picking / palette editing / new theme | nav theme picker, swatch edit dialog | `POST /api/session-theme`, `POST /api/themes` → `saveThemeFile` (deterministic); authored themes via `.claude/commands/add-theme.md` | n/a |
| 13 | Target repo/folder | Target Folder picker | `POST /api/target-repo` (deterministic); consumed by `capture_artifact` copy + `/plan-closeout` step 6 | n/a |
| 14 | Session progress pipe | automatic on PostToolUse / SubagentStop / Stop | `scripts/pipe-progress.mjs` wired in `.claude/settings.json` hooks (+ CLI mode) → `POST /api/progress` — deterministic, NO model in the pipe; port discovered from `.logs/bridge-port.json`, token cursor committed only on confirmed delivery; ride-along overlap (failed POST re-covered by next event) is now clamped by `tokenCursor` ledger (2026-07-09 idempotency fix) | n/a |
| 15 | Token meter | automatic | pipe-progress transcript-delta cursor → `tokens` on progress events; `SessionStore.tokenTotals` / `sumTokensFile` — deterministic | n/a |
| 16 | Studio/bridge/MCP diagnosis | "seems broken", hangs, port suspicion | agent **`devops-diagnostician`** / `.claude/commands/diagnose-studio.md` | NO |
| 17 | Writing/extending tests | features land/change, failures | agent **`test-engineer`** | NO |
| 18 | Capturing facts/guardrails, wiki/code drift | any authoritative fact | agent **`wiki-librarian`** | NO |
| 19 | Agentic-learnings capture | non-obvious discovery, any time | rule 4 (`.agents/learnings.md` immediately) + dispatcher **Learn** step (`/create-dispatch-command` template, step 6 of `/dispatch-askaquestion-next-phase`) + `/plan-closeout` steps 3–4 (harvest → improve commands); changelog footers → **`wiki-librarian`** | Writing the learning line is inline; improving commands happens at closeout |
| 20 | Recurring task with no procedure | asked twice = failure | `.claude/commands/new-command.md` | n/a |
| 21 | Verification before any completion claim | rule 10 | `.claude/commands/build-check.md` (`npm run build` + `npm test`) | Runs the command; test authoring → row 17 |
| 22 | Artifact notes (fullscreen Notes panel, Save notes) | `POST /api/artifact-notes` | `SessionStore.updateArtifactNotes` (deterministic — sidecar rewrite + `artifact` broadcast) | n/a |
| 23 | Return to a previous round (⟲ tag on a round separator → re-answer + rewind) | prefilled BoardSurvey → `POST /api/respond` with the old round's boardId | bridge `acceptRevisit` (deterministic rewrite/routing); rebuild by agent **`brainstorm-orchestrator`** via `.claude/commands/revisit-round.md` | Interpretation YES (orchestration); generation → row 3 |
| 24 | Reopen a completed thread (↩ button on banner, or ↩ action on round separator) | archived-thread view → confirm dialog → `POST /api/command {command:'reopen', discussionId, round}` | `.claude/commands/reopen.md` (git mv from `_completed/` back to live, `present_board` to resume) via agent **`brainstorm-orchestrator`** | Runs the procedure |

Zero unowned tasks. A new interface mechanic MUST land with a row here (rule 12).

## Table 2 — Message/gesture → persistence location (recall audit)

All paths are under the thread dir `discussion/<stamp>-<slug>/` unless noted. Writers in
`apps/mcp/src/session-store.ts` and `bridge-server.ts`; everything reloads via
`SessionStore.open` / `GET /api/discussions/<id>`.

| # | Message / gesture | Persisted at | Recall path |
|---|---|---|---|
| 1 | Boards + every per-option SVG | `round-NN/board.json` + `round-NN/option-<id>.svg` (`recordBoard`) | thread reload; `load_discussion` returns svgPaths |
| 2 | Board responses (every gesture incl. `commands`, `model`, `paletteColors`) | `round-NN/response.json` (`recordResponse`; REWRITTEN in place on a revisit via `acceptRevisit` — `brainstorm.md` appends, history never erased) | thread reload |
| 3 | Text memory: rounds, digested responses, retitles, theme/target changes, artifact-chat traces, orchestrator per-round decision blocks | `brainstorm.md` (append-only) | Read the file; the re-synthesis source |
| 4 | Progress events (hook + CLI posts) | `progress.jsonl` (`recordProgress`, append-only) | thread reload; last 200 in `StudioState.progress` |
| 5 | Token totals | DERIVED, no separate file — sum of `tokens` over `progress.jsonl` (`tokenTotals` / `sumTokensFile`) | recomputed on every list/state |
| 6 | Artifact chat dialog (both roles, `revisedSlug`; incl. option chats keyed `option:<boardId>:<optionId>`) | `artifacts/chat.jsonl` (append-only) + one-line `brainstorm.md` trace | thread reload → `StudioState.artifactChat`; live threads enable composer, archived threads replay persisted `artifactChat` read-only (no composer; `GET /api/discussions/<id>` populates `archived.artifactChat`) |
| 7 | Artifacts + provenance (incl. `revises`) | `artifacts/<slug>.svg` + `<slug>.json`; copy to `<targetRepo>/brainstorm-artifacts/` when set | thread reload; studio shelf |
| 7b | Artifact notes (Save notes) | `artifacts/<slug>.json` rewritten in place (`updateArtifactNotes` — SVG untouched) | thread reload; live `artifact` broadcast (useBridge upserts by slug) |
| 8 | Response/panel attachments | `attachments/<stamp>-<name>` (`persistAttachment`; `savedPath` recorded in the response) | `savedPath` in `response.json`; honest FAILED digest line when persistence failed (rule 6) |
| 9 | Non-text seeds (sketch/image) | `<discussionRoot>/.seeds/seed-<stamp>.<ext>` OR, for an annotated-photo sketch, the folder `<discussionRoot>/.seeds/seed-<stamp>/` (`persistSeed`) | digest/seed-note line points at the file/folder; annotated scribbles route to `/read-scribble`; text/voice seeds ride the digest itself |
| 10 | Thread settings: title, theme, targetRepo | `session.json` (+ a `brainstorm.md` note per change) | thread reload |
| 11 | UI commands — board-waiting path | synthetic park response: `commands:[...]` + prompt/seedNote in `elaboration` → `round-NN/response.json` + `brainstorm.md` digest | thread reload |
| 12 | UI commands — queued path (`pendingUiCommands`) | `<discussionRoot>/.logs/pending-commands.jsonl` (append-only: command, at, prompt, seedNote, drained?) — reloaded on MCP restart to prevent loss (DURABLE as of 2026-07-09); in-memory until drained into a tool result | `session_status.pendingUiCommands` while alive; `.logs/pending-commands.jsonl` after (survives restart) |
| 12b | Concierge pending question or gallery pending pick | `<thread>/intake-pending.json` (overwritten per Q/pick, cleared on success) — rehydrated on MCP restart and re-called ask_concierge/present_gallery returns stored answer/pick (DURABLE as of 2026-07-09) | re-call the tool with same inputs after restart → stored answer/pick returned immediately |
| 12c | Pending open_studio seedBrief | `<discussionRoot>/.logs/pending-brief.json` (cleared on round 1) — rehydrated on MCP restart so brief survives browser close/reopen (DURABLE as of 2026-07-09) | studio can re-present brief; `/api/state` includes it |
| 12d | Intake gate completion | `SessionInfo.intake?: {complete, method?}` in `session.json` — written by recordGalleryPick; persists the gate state across restarts (DURABLE as of 2026-07-09) | thread reload → `StudioState.intake` |
| 12e | Option annotations (marks drawn in fullscreen) | `BoardResponse.optionAnnotations` (Record<optionId, ScribbleAnnotations>) in `round-NN/response.json` + composite PNG as `annotated-<optionId>.png` in `attachments/` (persisted via normal attachment path) (DURABLE as of 2026-07-09) | thread reload; digest emits "Annotated ON … marks …; VIEW <savedPath>" |
| 13 | Runtime diagnostics | `discussion/.logs/mcp-<date>.log` (FileLog, pid-tagged) + `GET /api/logs` ring | evidence trail for `devops-diagnostician` |

## Known gaps (recorded honestly — rule 6)

- **Queued UI commands are ephemeral.** ✓ CLOSED (2026-07-09) — journaled to
  `<discussionRoot>/.logs/pending-commands.jsonl` (append-only: command, at, prompt,
  seedNote, drained?) and reloaded on MCP restart to prevent loss. The full compiled
  `seedNote` survives. Artifact-chat is still exempt: its user message hits
  `artifacts/chat.jsonl` BEFORE dispatch.
- **open_studio landing brief.** ✓ CLOSED (2026-07-09) — persists to
  `<discussionRoot>/.logs/pending-brief.json` until consumed on round 1; rehydrated on MCP
  restart so the brief survives browser close/reopen.
- **`think()` shimmer notes** (`thinking` WS envelope) are ephemeral by design — the
  persisted progress pipe (Table 2 row 4) is the durable channel.
- **Token cursor files** (`vibr-token-cursor-*.json` in OS temp) are delta cursors, not
  records: losing one re-bases the next delta at zero (never fabricates); already-posted
  totals in `progress.jsonl` are unaffected.
