# System Architecture (LOCK)

Changes to this page require an operator-approved plan in `.docs/discussion/` and a `log.md` entry.

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
- `GET /api/state` — full session state (hello payload) incl. themes/models for initial load/reconnect.
- `GET /api/discussions` — all cached threads (left-nav source), newest first; threads in
  `_completed/` carry `archived: true` and populate the Archive nav section.
- `GET /api/discussions/<id>` — full thread reload (boards + SVGs + responses + artifacts);
  resolves live root first, then `_completed/`.
- `POST /api/respond` — BoardResponse (zod-validated), incl. the user's `model` choice and
  per-phase fields (triage/mutations/flaws/positions/clusters/gapNotes).
- `POST /api/command` — UI buttons (plan-closeout, discover-skills). If a board is awaiting a
  response the wait resolves immediately (action `park` + `commands`); otherwise queued and
  drained into the next present_board tool result. Either way Claude runs
  `.claude/commands/<command>.md`.
- `GET /ws` — WebSocket; server→studio envelopes: `hello`, `board`, `thinking`, `responded`, `artifact`.

## Configuration — `visual-brainstorm.config.json` (cwd, human-editable)

```
targetRepo     optional path; accepted artifacts are ALSO copied to <targetRepo>/brainstorm-artifacts/
stylesDir      theme JSON drop-in folder, default "styles"
theme          default theme name, default "neon-purple"
models         composer picker list, default [claude-fable-5, claude-opus-4-8, claude-sonnet-5, claude-haiku-4-5]
defaultModel   default "claude-fable-5"
discussionDir  thread-cache root, default ".docs/discussion"
```

## Style ingestion framework

Themes conform to `ThemeSchema` in packages/protocol (name, label, light+dark var sets:
canvas/surface/surface2/line/ink/inkDim/accent). Built-ins live in `apps/mcp/src/themes.ts`
(default: **neon-purple**); user themes are ingested from `<cwd>/<stylesDir>/*.json` and
shadow built-ins by name. Selection: visually via the studio's swatch picker (persisted in
localStorage) or by config (`theme`). The studio applies vars live and tracks the OS
light/dark scheme.

## Persistence layout — the thread cache (rule 7: nothing is ever regenerated)

Rooted at `VIBR_HOME` env or `<cwd>/<discussionDir>` (default `.docs/discussion`; cwd = the
project being brainstormed). A directory is a thread iff it contains `session.json` — plans
and threads coexist in the discussion folder (donor pattern). Threads are committable, fully
reloadable in the UI (left nav) and by Claude (`list_discussions` / `load_discussion` /
`present_board.discussionId` resume).

```
.docs/discussion/<yyyy-mm-dd-hhmm>-<slug>/
  session.json                 thread meta (id = directory basename)
  round-01/board.json          full board payload
  round-01/option-<id>.svg     every presented SVG, individually cached
  round-01/response.json       the user's survey response (incl. chosen model)
  artifacts/<slug>.svg         accepted/final artifacts
  artifacts/<slug>.json        provenance: boardId, optionIds, notes
```

## Non-negotiables

- apps/mcp: **stderr-only logging** (stdout is the MCP channel).
- Studio sanitizes all SVG before DOM insertion (no scripts / on* / foreignObject / js: hrefs).
- protocol package has zero runtime deps besides zod.
