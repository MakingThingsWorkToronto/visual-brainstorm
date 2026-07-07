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
| 1 | Start/resume a brainstorm; New Discussion panel; bare `/run-brainstorm` | panel submit → `new-brainstorm` command; `open_studio` landing | `.claude/commands/run-brainstorm.md` (orchestrator) | YES — orchestration is never delegated |
| 2 | Board-response mechanic bundle: selection, per-option notes, remix pairs, axis dials, elaboration, triage, mutations, flaws, positions/clusters/gapNotes, deckVerdicts, duelResults, ranking, requestedPhase, Back | all board surfaces + composer; delivered as `feedbackDigest` in the `present_board` result | orchestrator via `/run-brainstorm` steps 4–6 + `.claude/skills/brainstorm-phases` | Interpretation YES (that IS orchestration); the generation it triggers → row 3 |
| 3 | Option/round SVG generation + model routing (`BoardResponse.model`, new-brainstorm `model`) | More Tools (+) model picker; every next-round build | agent **`svg-artisan`** (model override applies) — always delegated | NO |
| 4 | Artifact chat — question | fullscreen artifact panel → `POST /api/artifact-chat` | general subagent via `.claude/commands/artifact-chat.md` | NO — orchestrator only routes + `reply_artifact_chat` |
| 5 | Artifact chat — change request | same | agent **`svg-artisan`** via `/artifact-chat`; delivered as `capture_artifact` with `revises` + `reply_artifact_chat` | NO |
| 6 | Plan closeout | More Tools → Plan closeout; Finalize & close out; `finalize` response | `.claude/commands/plan-closeout.md` | Runs the procedure; step 5 (wiki) → **`wiki-librarian`** |
| 7 | Skill discovery/ingestion | More Tools → Discover skills | `.claude/commands/discover-skills.md` | Runs the interactive procedure |
| 8 | Decision poster on finalize | `finalOptionId` set → after `capture_artifact` | `compose_poster` MCP tool — DETERMINISTIC, no model | n/a (tool call only) |
| 9 | Seeds — all four kinds (text \| sketch \| image \| voice) | New Discussion panel intake → `POST /api/command` | bridge `persistSeed` (deterministic) → digest note; orchestrator Reads the saved file (`/run-brainstorm` step 1) | Persistence never touches a model |
| 10 | Composer attachments (Attach file / Take a photo) | More Tools (+) → chips under the reply box | bridge `persistAttachment` (deterministic); orchestrator Reads each `savedPath` (`/run-brainstorm` step 4) | Persistence never touches a model |
| 11 | Palette pick (Colors, by theme) | More Tools (+) Colors / panel Colors card | deterministic ONLY-these-colors digest line; honored during generation by row 3 | NO generation inline |
| 12 | Theme picking / palette editing / new theme | nav theme picker, swatch edit dialog | `POST /api/session-theme`, `POST /api/themes` → `saveThemeFile` (deterministic); authored themes via `.claude/commands/add-theme.md` | n/a |
| 13 | Target repo/folder | Target Folder picker | `POST /api/target-repo` (deterministic); consumed by `capture_artifact` copy + `/plan-closeout` step 6 | n/a |
| 14 | Session progress pipe | automatic on PostToolUse / SubagentStop / Stop | `scripts/pipe-progress.mjs` wired in `.claude/settings.json` hooks (+ CLI mode) → `POST /api/progress` — deterministic, NO model in the pipe | n/a |
| 15 | Token meter | automatic | pipe-progress transcript-delta cursor → `tokens` on progress events; `SessionStore.tokenTotals` / `sumTokensFile` — deterministic | n/a |
| 16 | Studio/bridge/MCP diagnosis | "seems broken", hangs, port suspicion | agent **`devops-diagnostician`** / `.claude/commands/diagnose-studio.md` | NO |
| 17 | Writing/extending tests | features land/change, failures | agent **`test-engineer`** | NO |
| 18 | Capturing facts/guardrails, wiki/code drift | any authoritative fact | agent **`wiki-librarian`** | NO |
| 19 | Agentic-learnings capture | non-obvious discovery, any time | rule 4 (`.agents/learnings.md` immediately) + dispatcher **Learn** step (`/create-dispatch-command` template, step 6 of `/dispatch-askaquestion-next-phase`) + `/plan-closeout` steps 3–4 (harvest → improve commands); changelog footers → **`wiki-librarian`** | Writing the learning line is inline; improving commands happens at closeout |
| 20 | Recurring task with no procedure | asked twice = failure | `.claude/commands/new-command.md` | n/a |
| 21 | Verification before any completion claim | rule 10 | `.claude/commands/build-check.md` (`npm run build` + `npm test`) | Runs the command; test authoring → row 17 |

Zero unowned tasks. A new interface mechanic MUST land with a row here (rule 12).

## Table 2 — Message/gesture → persistence location (recall audit)

All paths are under the thread dir `discussion/<stamp>-<slug>/` unless noted. Writers in
`apps/mcp/src/session-store.ts` and `bridge-server.ts`; everything reloads via
`SessionStore.open` / `GET /api/discussions/<id>`.

| # | Message / gesture | Persisted at | Recall path |
|---|---|---|---|
| 1 | Boards + every per-option SVG | `round-NN/board.json` + `round-NN/option-<id>.svg` (`recordBoard`) | thread reload; `load_discussion` returns svgPaths |
| 2 | Board responses (every gesture incl. `commands`, `model`, `paletteColors`) | `round-NN/response.json` (`recordResponse`) | thread reload |
| 3 | Text memory: rounds, digested responses, retitles, theme/target changes, artifact-chat traces, orchestrator per-round decision blocks | `brainstorm.md` (append-only) | Read the file; the re-synthesis source |
| 4 | Progress events (hook + CLI posts) | `progress.jsonl` (`recordProgress`, append-only) | thread reload; last 200 in `StudioState.progress` |
| 5 | Token totals | DERIVED, no separate file — sum of `tokens` over `progress.jsonl` (`tokenTotals` / `sumTokensFile`) | recomputed on every list/state |
| 6 | Artifact chat dialog (both roles, `revisedSlug`) | `artifacts/chat.jsonl` (append-only) + one-line `brainstorm.md` trace | thread reload → `StudioState.artifactChat` |
| 7 | Artifacts + provenance (incl. `revises`) | `artifacts/<slug>.svg` + `<slug>.json`; copy to `<targetRepo>/brainstorm-artifacts/` when set | thread reload; studio shelf |
| 8 | Response/panel attachments | `attachments/<stamp>-<name>` (`persistAttachment`; `savedPath` recorded in the response) | `savedPath` in `response.json`; honest FAILED digest line when persistence failed (rule 6) |
| 9 | Non-text seeds (sketch/image) | `<discussionRoot>/.seeds/seed-<stamp>.<ext>` (`persistSeed`) | digest/seed-note line points at the file; text/voice seeds ride the digest itself |
| 10 | Thread settings: title, theme, targetRepo | `session.json` (+ a `brainstorm.md` note per change) | thread reload |
| 11 | UI commands — board-waiting path | synthetic park response: `commands:[...]` + prompt/seedNote in `elaboration` → `round-NN/response.json` + `brainstorm.md` digest | thread reload |
| 12 | UI commands — queued path (`pendingUiCommands`) | in-memory ONLY until drained into a tool result; dispatch line (prompt truncated to 60 chars) in `discussion/.logs/` | `session_status.pendingUiCommands` while alive; `.logs` after — see Known gaps |
| 13 | Runtime diagnostics | `discussion/.logs/mcp-<date>.log` (FileLog, pid-tagged) + `GET /api/logs` ring | evidence trail for `devops-diagnostician` |

## Known gaps (recorded honestly — rule 6)

- **Queued UI commands are ephemeral.** `commandQueue`/`commandWaiters` live in bridge
  memory. If the MCP process dies before a `present_board`/`open_studio` drains the queue,
  the command intent survives only as a truncated `.logs` line; the full compiled
  `seedNote` is not written to disk. The heavy payloads themselves DO persist (`.seeds/`,
  `attachments/`) — only the routing instruction can be lost. Artifact-chat is exempt: its
  user message hits `artifacts/chat.jsonl` BEFORE dispatch.
- **open_studio landing brief** (prompt/seedNote) is returned in the tool result only; it
  reaches `brainstorm.md` when round 1 is presented. Same `.logs` fallback as above.
- **`think()` shimmer notes** (`thinking` WS envelope) are ephemeral by design — the
  persisted progress pipe (Table 2 row 4) is the durable channel.
- **Token cursor files** (`vibr-token-cursor-*.json` in OS temp) are delta cursors, not
  records: losing one re-bases the next delta at zero (never fabricates); already-posted
  totals in `progress.jsonl` are unaffected.
