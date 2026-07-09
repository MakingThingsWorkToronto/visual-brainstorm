# System Architecture (LOCK)

Changes to this page require an operator-approved plan in `discussion/` and a `log.md` entry.

## Shape

npm-workspaces monorepo, ESM + TypeScript NodeNext, Node ≥ 20.

```
packages/protocol    @visual-brainstorm/protocol — zod schemas + TS types. THE source of truth
                     for Board, BoardOption, SurveyConfig, Axis, BoardResponse, WS envelopes.
apps/mcp             @visual-brainstorm/mcp — stdio MCP server launched BY Claude Code from the
                     user's project. Owns the "bridge": a local http+WebSocket server that
                     serves the built studio and relays boards/responses. Persists sessions.
apps/studio          @visual-brainstorm/studio — Vite + React + Tailwind v4 SPA. Built to
                     apps/studio/dist and served statically by the bridge. Never talks MCP;
                     only WS push (boards in) + HTTP POST (responses out).
apps/wiki-mcp        @visual-brainstorm/wiki-mcp — read-only stdio MCP server over the repo's
                     authoritative `wiki/` folder. Exposes seven tools (search, outline, read,
                     list, toc, related, reload) for context-shaped wiki access — no write tools
                     (edits stay plain-file via wiki-librarian). ESM/NodeNext + @modelcontextprotocol/sdk,
                     dependency-free search, stdio-only. Registered in `.mcp.json` as
                     `visual-brainstorm-wiki` (node apps/wiki-mcp/dist/index.js). Built by the
                     root npm run build; tested by tests/wiki-mcp.test.mjs.
.github/             workspace-local GitHub Copilot instructions, prompts, agents, hooks, and
                     cloud setup — thin adapters over `.claude/`,
                     `.claude/agentic-surface-registry.json`, and the MCP tool surface. They
                     improve command discovery but do not own workflow logic. `.vscode/mcp.json`
                     is the local VS Code `servers` manifest; `.github/mcp.json` is a versioned
                     GitHub-compatible `mcpServers` payload, supplied through agent-scoped
                     declarations or repository MCP settings rather than auto-discovered by
                     GitHub.com. Hosted agents run stdio in an ephemeral runner whose loopback
                     bridge cannot expose the human-facing browser studio.
.codex/              workspace-local Codex project config, hooks, and custom-agent `.toml`
                     files. Thin adapter over `.claude/`; no duplicated workflow logic.
.agents/skills/      Codex-discoverable skill mirror of `.claude/skills/` so Codex loads the
                     same craft rules natively while `.claude/` remains the source of truth.
```

## Data flow — the mashup

```
Claude Code ──stdio MCP──▶ apps/mcp ──WS push (board)──▶ studio (browser)
Claude Code ◀─tool result── apps/mcp ◀─POST /api/respond── studio (user clicks Send)
```

- `present_board` blocks inside the MCP tool call until the studio POSTs a response
  (AskUserQuestion semantics, rendered as a rich SVG survey).
- The bridge starts lazily on the first `present_board` and auto-opens the browser once.
- Multiple tabs are safe: boards broadcast to all sockets; the first response wins and a
  `responded` broadcast retires the board everywhere.

## Ports & endpoints

- Bridge port: `VIBR_PORT` env, default **5199**, loopback only (`127.0.0.1`).
- `Bridge.start()` writes `<discussionRoot>/.logs/bridge-port.json` (actual port + pid;
  last-started bridge wins) — port discovery for `scripts/pipe-progress.mjs`, whose posts
  a port-conflict fallback would otherwise silently orphan (see
  System/testing-observability §Observability).
- `GET /` static studio (dist resolved `../../studio/dist` from apps/mcp/dist; override `VIBR_STUDIO_DIST`).
- `GET /api/health` — self-diagnosis: pid, port, startedAt, session id/dir, active board,
  connected clients, studio-dist existence. First stop when anything "seems broken"
  (`.claude/commands/diagnose-studio.md`; field semantics:
  System/testing-observability §Observability).
- `POST /api/client-log` — `{ source, message, stack? }` (zod-validated, 32k body cap)
  from the studio's global error handlers/CrashBoundary; written to the same log ring as
  bridge events, prefix `STUDIO CLIENT ERROR [source]:` (see
  System/testing-observability §Observability).
- `GET /api/state` — full session state (hello payload) incl. runtime metadata, themes, and the
  structured model catalog for initial load/reconnect.
- `GET /api/discussions` — all cached threads (left-nav source), newest first; threads in
  `_completed/` carry `archived: true` and populate the Archive nav section.
- `GET /api/discussions/<id>` — full thread reload (boards + SVGs + responses + artifacts
  + `artifactChat` dialog replay + `tokens` totals); resolves live root first, then
  `_completed/`.
- `POST /api/respond` — BoardResponse (zod-validated), incl. the user's `model` choice,
  per-phase fields (triage/mutations/flaws/positions/clusters/gapNotes/questionAnswers/
  uncertainties/optionAnnotations/remixNotes), and `attachments` (data URIs persisted by the
  bridge to `<thread dir>/attachments/` before the response is recorded/broadcast — see
  interaction-protocol §Attachments). Logs any unknown keys zod strips (schema-drift tripwire).
  A response whose `boardId` names an already-answered round is a REVISIT: `acceptRevisit`
  rewrites that round's `response.json` and routes the rewind (interaction-protocol §Return
  to a previous round).
- `POST /api/concierge` — `{ id, answer, picked?: string[], typed?: string }` — the user's
  answer to a concierge question (picked = suggestion chips tapped, typed = their own words).
  If no waiter is blocked (MCP process restarted), the answer persists to `<thread>/
  intake-pending.json` and the MCP tool returns `pending`; when re-called, the stored answer
  returns immediately. Durable recovery path.
- `POST /api/gallery-pick` — `{ method, label, recommended }` — the user picked a method
  card. If no waiter is blocked, the pick persists to `<thread>/intake-pending.json`; when
  re-called, the stored pick returns immediately (crash recovery). Also records the intake
  completion to `session.json` (`SessionInfo.intake={complete, method}`).
- `POST /api/command` — UI-invoked procedures (plan-closeout, discover-skills,
  new-brainstorm). If a board is awaiting a response the wait resolves immediately (action
  `park` + `commands`); if `waitForCommand` is blocked (open_studio landing flow) the waiter
  takes it directly; otherwise queued to `<discussionRoot>/.logs/pending-commands.jsonl`
  (undrained on MCP restart) and drained into the next present_board tool result. Either way
  Claude runs `.claude/commands/<command>.md`. Optional payload fields, all compiled into
  `CommandRequest.seedNote` lines for the orchestrator:
  - `seed` (SeedIntake, see interaction-protocol): non-text seeds persist as either a single
    file `<discussionRoot>/.seeds/seed-<stamp>.(svg|png|jpeg|…)` (plain images or legacy
    sketches) OR a folder `<discussionRoot>/.seeds/seed-<stamp>/` (annotated scribbles with
    compositeDataUri or annotations: composite.png, photo.<ext>, scribble.svg, scribble.json,
    README.md); a bad or oversized image (10 MB cap) produces an honest failure note (rule 6).
  - `attachments` (ResponseAttachment[], new-brainstorm): persisted via persistAttachment;
    per-file "Seed file … saved at <path> — Read it" or honest FAILED note.
  - `model`: "Model routing: the user chose <model> — delegate round generation to it."
  - `palette` (PaletteColor[], max 64): "Palette: generate ALL SVGs using ONLY these
    colors: …".
  - `intakeAnswers` (new-brainstorm): `[{question, answers[]}]` — the intake survey answers,
    per-question (distinct from flattened prompt) — compiles per-question seedNote lines.
- `GET /api/artifact-svg/<slug>.svg` — serves live-thread artifact SVGs (used by the
  wayfinder strip's drag-out/download); 404 for an unknown slug.
- `POST /api/artifact-chat` — `{artifactSlug, text}` from the fullscreen artifact chat
  panel. The slug is a captured artifact OR a board option from any round via the
  synthetic `option:<boardId>:<optionId>` slug, resolved against the thread's cached
  rounds. Persists the user message (append-only `artifacts/chat.jsonl` + a brainstorm.md
  line), broadcasts the `artifact-chat` envelope, and routes to Claude Code as UI command
  `artifact-chat` via the same plumbing as `POST /api/command`. Unknown slug/option →
  honest 404. Contract: interaction-protocol §Artifact chat; procedure:
  `.claude/commands/artifact-chat.md`.
- `POST /api/artifact-notes` — `{artifactSlug, notes}` (zod-validated, 8k cap) from the
  fullscreen Notes panel. `SessionStore.updateArtifactNotes` rewrites
  `artifacts/<slug>.json` in place (the SVG is untouched) and broadcasts the updated
  `artifact` envelope (useBridge upserts by slug). Live thread only; unknown slug →
  honest 404.
- `GET /api/decision-tree/:id` — builds and returns the decision tree from the reloaded
  thread (live or archived), deterministically rendered to sanitized SVG. `SessionStore`
  writes `decision-tree.json` (structured tree) + `decision-tree.svg` (rendered index) at
  the thread root on each response (derived, safe to overwrite). Studio: **🌳 decision tree**
  toggle in the WayfinderStrip opens a `DecisionTreeView` overlay (fetches server-built SVG
  + legend).
- `POST /api/target-repo` — `{ path: string|null, scope: 'thread'|'default' }`. Validates the
  folder exists (honest 400; any plain folder qualifies, not necessarily a git repo).
  `thread` → `SessionInfo.targetRepo` in session.json; `default` → rewrites `targetRepo` in
  visual-brainstorm.config.json. Broadcasts `hello` on success. `StudioState.targetRepo`
  carries the EFFECTIVE value (thread override ?? config default).
- `POST /api/themes` — `{ theme }` (full ThemeSchema, zod-validated). Persists via
  `BridgeOptions.saveTheme` (`saveThemeFile` → `<stylesDir>/<name>.json`; an edited
  built-in is shadowed by its saved copy on every future load); the bridge refreshes its
  mutable theme list and rebroadcasts `hello`. No saveTheme writer attached → honest 400.
- `POST /api/session-theme` — `{ name: string|null }`. Validated against the theme list
  (unknown name → honest 400); persists the per-discussion theme via `SessionStore.setTheme`
  (session.json + a brainstorm.md note) and broadcasts `hello`. `null` clears it.
- `GET /ws` — WebSocket; server→studio envelopes: `hello`, `board`, `thinking`, `responded`, `artifact`, `artifact-chat`.

## Configuration — `visual-brainstorm.config.json` (cwd, human-editable)

```
targetRepo     optional path (any folder) — the DEFAULT target; per-thread override lives in
               SessionInfo.targetRepo (session.json, set via the studio's Target Folder
               picker in the composer row or
               POST /api/target-repo). Effective target = thread override ?? config default;
               accepted artifacts are ALSO copied to <effective>/brainstorm-artifacts/
stylesDir      theme JSON drop-in folder, default "styles"
theme          default theme name, default "neon-purple"
runtime        live orchestration runtime metadata (id / label / provider), default Claude Code
models         structured model catalog for the composer's More Tools (+) menu picker;
               each entry carries id / label / provider / engineIds / capabilities
defaultModel   default "claude-fable-5"
discussionDir  thread-cache root, default "discussion"
```

## Style ingestion framework

Themes conform to `ThemeSchema` in packages/protocol (name, label, light+dark var sets:
canvas/surface/surface2/line/ink/inkDim/accent, plus an optional curated `palette` — 5
named generation colors for the Colors picker; interaction-protocol §Generation palettes).
Built-ins live in `apps/mcp/src/themes.ts` (default: **neon-purple**) and each carries a
curated palette; drop-in theme JSON may include one too — without it the picker derives a
fallback from the light variant. User themes are ingested from `<cwd>/<stylesDir>/*.json`
and shadow built-ins by name; palette edits in the studio write those same drop-in files
(`saveThemeFile` via `POST /api/themes`), so edits round-trip through ingestion. Theme
selection is **per discussion**: `SessionInfo.theme` (optional, session.json) is set by the
nav theme picker or a palette-row pick in the board composer (`POST /api/session-theme`);
the studio applies the viewed discussion's theme first, then the stored local pick, then
the config default (`theme`) — archived threads reopen in their own theme. The studio
applies vars live and tracks the OS light/dark scheme.

## Persistence layout — the thread cache (rule 7: nothing is ever regenerated)

Rooted at `VIBR_HOME` env or `<cwd>/<discussionDir>` (default `discussion`; cwd = the
project being brainstormed). A directory is a thread iff it contains `session.json` — plans
and threads coexist in the discussion folder (donor pattern). Threads are committable, fully
reloadable in the UI (left nav) and by Claude (`list_discussions` / `load_discussion` /
`present_board.discussionId` resume).

```
discussion/<yyyy-mm-dd-hhmm>-<slug>/
  session.json                 thread meta (id = directory basename; incl. optional
                               targetRepo override + intake gate: {complete, method?})
  brainstorm.md                append-only TEXT memory: every round's options (labels,
                               lineage) + every response digest — the re-synthesis source
  thinking.jsonl               append-only chain-of-thought stream (previously ephemeral;
                               bridge record_thinking → SessionStore.recordThinking)
  round-01/board.json          full board payload (incl. questions for mid-round asks,
                               option rationale)
  round-01/option-<id>.svg     every presented SVG, individually cached
  round-01/response.json       the user's survey response (incl. chosen model, questionAnswers,
                               uncertainties, optionAnnotations, remixNotes); rewritten
                               in place on a revisit (brainstorm.md appends — never erased)
  round-01/tree-ops.jsonl      mind-map methodology: append-only node-op log (TreeOp:
                               explode|delete|add|note|rename|move, nodeId, topic, note?,
                               count?, oldTopic?, newParentId?, newParentTopic?, at?) — the
                               INTENT trail (old/newParent fields support rename/move ops)
  round-01/edited-tree.json    mind-map final structure with folded notes (MindNode tree;
                               only written for tree-payload rounds)
  attachments/<stamp>-<name>   composer file/photo attachments + annotated-<optionId>.png
                               (composite PNGs from option annotations), decoded from response
                               data URIs by the bridge (savedPath in the recorded response)
  intake-pending.json          pending concierge question or gallery pick (overwritten per
                               Q/pick, cleared on success, rehydrated on MCP restart)
  progress.jsonl               append-only session-progress events (SessionActivity strip,
                               token meter) — never rewritten, reloads with the thread
  artifacts/<slug>.svg         accepted/final artifacts
  artifacts/<slug>.json        provenance: boardId, optionIds, notes (+ optional `revises`:
                               parent slug — a revision is a NEW artifact, rule 7);
                               rewritten in place when notes are saved (/api/artifact-notes)
  artifacts/chat.jsonl         append-only artifact-chat messages (ArtifactChatMessage:
                               user questions + Claude replies, revisedSlug links)
  decision-tree.json           derived index: per-thread decision tree (one node per round,
                               chosen ✓ / rejected ✕ / action / explode·delete·note ops,
                               coloured by decision kind) — built server-side, safe to overwrite
  decision-tree.svg            derived index: decision tree rendered deterministically as
                               sanitized (rule 8) SVG, served at GET /api/decision-tree/:id

discussion/.seeds/seed-<stamp>.(svg|png|jpeg|…)   non-text seed intake files (root-level,
                               not per-thread — the seed precedes the thread) OR
discussion/.seeds/seed-<stamp>/  annotated-scribble folder (composite.png, photo.<ext>,
                               scribble.svg, scribble.json, README.md) for sketches
                               carrying annotations or a composite
discussion/.logs/bridge-port.json   actual bridge port + pid, written on Bridge.start()
                               (pipe-progress port discovery — see Ports & endpoints)
discussion/.logs/pending-commands.jsonl   append-only journal of UI commands queued while
                               no tool blocks them (pending-commands, drained on next
                               present_board/open_studio, undrained entries reload on MCP
                               restart to prevent loss of plan-closeout/discover-skills/etc)
discussion/.logs/pending-brief.json   the open_studio seedBrief (brief, summary, questions,
                               picks) persists until consumed on round 1, rehydrated if MCP
                               restarts before the user submits
```

**Atomicity guardrail.** All JSON and SVG writes use atomic write (tmp + rename) via
`writeFileAtomic` in `SessionStore`. On `open()` reload, `board.json` and `response.json`
are parsed per-round with a try-catch: if a round is corrupt (partial write from a crash),
it is skipped and logged honestly (never bricking the thread).

## Non-negotiables

- apps/mcp: **stderr-only logging** (stdout is the MCP channel).
- Studio sanitizes all SVG before DOM insertion (no scripts / on* / foreignObject / js: hrefs).
- **Version-skew guardrail**: a long-running bridge process can predate the studio bundle
  it serves, so `useBridge`'s `hello` handler merges server state over typed defaults
  (`{ ...EMPTY, ...msg.state }`). Any field added to `StudioState` in packages/protocol
  MUST get a default in useBridge's EMPTY object (`apps/studio/src/lib/useBridge.ts`).
- protocol package has zero runtime deps besides zod.
- **One authoritative workflow layer.** All orchestration and generation procedures live in
  `.claude/{commands,skills,agents}` and are wrapped by supported harness adapters
  (`.github/` for Copilot, `.codex/` + `.agents/skills/` for Codex). No fake-success:
  real generation over real tools only.
