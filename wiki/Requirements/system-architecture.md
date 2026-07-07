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
- `GET /` static studio (dist resolved `../../studio/dist` from apps/mcp/dist; override `VIBR_STUDIO_DIST`).
- `GET /api/health` — self-diagnosis: pid, port, startedAt, session id/dir, active board,
  connected clients, studio-dist existence. First stop when anything "seems broken"
  (`.claude/commands/diagnose-demo.md`).
- `GET /api/state` — full session state (hello payload) incl. themes/models for initial load/reconnect.
- `GET /api/discussions` — all cached threads (left-nav source), newest first; threads in
  `_completed/` carry `archived: true` and populate the Archive nav section.
- `GET /api/discussions/<id>` — full thread reload (boards + SVGs + responses + artifacts);
  resolves live root first, then `_completed/`.
- `POST /api/respond` — BoardResponse (zod-validated), incl. the user's `model` choice,
  per-phase fields (triage/mutations/flaws/positions/clusters/gapNotes), and `attachments`
  (data URIs persisted by the bridge to `<thread dir>/attachments/` before the response is
  recorded/broadcast — see interaction-protocol §Attachments).
- `POST /api/command` — UI-invoked procedures (plan-closeout, discover-skills,
  new-brainstorm). If a board is awaiting a response the wait resolves immediately (action
  `park` + `commands`); if `waitForCommand` is blocked (open_studio landing flow) the waiter
  takes it directly; otherwise queued and drained into the next present_board tool result.
  Either way Claude runs `.claude/commands/<command>.md`. Optional payload fields, all
  compiled into `CommandRequest.seedNote` lines for the orchestrator:
  - `seed` (SeedIntake, see interaction-protocol): non-text seeds persist to
    `<discussionRoot>/.seeds/seed-<stamp>.(svg|png|jpeg|…)` with a note pointing at the
    file; a bad or oversized image (10 MB cap) produces an honest failure note (rule 6).
  - `attachments` (ResponseAttachment[], new-brainstorm): persisted via persistAttachment;
    per-file "Seed file … saved at <path> — Read it" or honest FAILED note.
  - `model`: "Model routing: the user chose <model> — delegate round generation to it."
  - `palette` (PaletteColor[], max 64): "Palette: generate ALL SVGs using ONLY these
    colors: …".
- `GET /api/artifact-svg/<slug>.svg` — serves live-thread artifact SVGs (used by the
  wayfinder strip's drag-out/download); 404 for an unknown slug.
- `POST /api/artifact-chat` — `{artifactSlug, text}` from the fullscreen artifact chat
  panel. Persists the user message (append-only `artifacts/chat.jsonl` + a brainstorm.md
  line), broadcasts the `artifact-chat` envelope, and routes to Claude Code as UI command
  `artifact-chat` via the same plumbing as `POST /api/command`. Unknown slug → honest 404.
  Contract: interaction-protocol §Artifact chat; procedure:
  `.claude/commands/artifact-chat.md`.
- `POST /api/target-repo` — `{ path: string|null, scope: 'thread'|'default' }`. Validates the
  folder exists (honest 400; any plain folder qualifies, not necessarily a git repo).
  `thread` → `SessionInfo.targetRepo` in session.json; `default` → rewrites `targetRepo` in
  visual-brainstorm.config.json (400 in the preview harness, which cannot persist config).
  Broadcasts `hello` on success. `StudioState.targetRepo` carries the EFFECTIVE value
  (thread override ?? config default).
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
models         model list for the composer's More Tools (+) menu picker, default [claude-fable-5, claude-opus-4-8, claude-sonnet-5, claude-haiku-4-5]
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
                               targetRepo override)
  brainstorm.md                append-only TEXT memory: every round's options (labels,
                               lineage) + every response digest — the re-synthesis source
  round-01/board.json          full board payload
  round-01/option-<id>.svg     every presented SVG, individually cached
  round-01/response.json       the user's survey response (incl. chosen model)
  attachments/<stamp>-<name>   composer file/photo attachments, decoded from response data
                               URIs by the bridge (savedPath in the recorded response)
  progress.jsonl               append-only session-progress events (SessionActivity strip,
                               token meter) — never rewritten, reloads with the thread
  artifacts/<slug>.svg         accepted/final artifacts
  artifacts/<slug>.json        provenance: boardId, optionIds, notes (+ optional `revises`:
                               parent slug — a revision is a NEW artifact, rule 7)
  artifacts/chat.jsonl         append-only artifact-chat messages (ArtifactChatMessage:
                               user questions + Claude replies, revisedSlug links)

discussion/.seeds/seed-<stamp>.(svg|png|jpeg|…)   non-text seed intake files (root-level,
                               not per-thread — the seed precedes the thread)
```

## Non-negotiables

- apps/mcp: **stderr-only logging** (stdout is the MCP channel).
- Studio sanitizes all SVG before DOM insertion (no scripts / on* / foreignObject / js: hrefs).
- protocol package has zero runtime deps besides zod.
- **One engine: Claude.** All orchestration and generation live in Claude + the
  `.claude/{commands,skills}` procedures — NEVER in harness code. `StudioState.engine` is
  `'claude'` (real sessions over MCP) or `'preview'` (`apps/mcp/src/preview.ts`: a dumb
  fixtures-only harness for exercising UI surfaces; fixture threads persist to a temp dir,
  not the discussion cache). The preview never simulates intelligence — no synthesis, no
  pool logic, no prompt handling; it says so in the UI. Hardcoded pseudo-orchestration is
  slop and a rule-6 fake-success.
