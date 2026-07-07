# Visual Brainstorm — Root Agentic Mandates

## Session bootstrap — a new chat reads this, then is fully operational

1. **This file** (rules + the quick map below).
2. **`wiki/README.md`**, then the wiki pages your task touches — the wiki is AUTHORITATIVE
   (rule 1). Architecture lock: `wiki/Requirements/system-architecture.md`. The improvement
   flywheel: `wiki/Meta/agentic-loop.md`.
3. **The skill for your task type** — brainstorming: `.claude/skills/brainstorm-phases` +
   `.claude/skills/svg-authoring`. Skills are binding craft, not suggestions.
4. **Open plans** — newest folders in `discussion/` (not `_completed/`) with `plan.md`.
5. **`.agents/learnings.md`** — hard-won gotchas; do not re-learn them.

### Quick map — "I need to…" → use

| Need | Use |
|---|---|
| Run/resume a visual brainstorm | `.claude/commands/run-brainstorm.md` + the two skills; resume via `list_discussions` → `discussionId`; thread memory = its `brainstorm.md` |
| Generate board options (esp. when `response.model` routes a round) | **agent `svg-artisan`** (with the model override) |
| Studio/bridge/MCP "seems broken" | **agent `devops-diagnostician`** or `.claude/commands/diagnose-studio.md`; evidence: `GET /api/health`, `GET /api/logs`, `discussion/.logs/` |
| Verify work | `.claude/commands/build-check.md` → `npm run build` + `npm test` (unit / smoke / ui-smoke — `wiki/System/testing-observability.md`) |
| Answer/revise a captured artifact (studio artifact chat) | `.claude/commands/artifact-chat.md` — ALWAYS subagents: questions → general, revisions → **`svg-artisan`** (`capture_artifact` with `revises`, reply via `reply_artifact_chat`) |
| Pipe session progress/tokens to the studio | `scripts/pipe-progress.mjs` (deterministic; wired via `.claude/settings.json` hooks — no model in the pipe) |
| Write/extend tests | **agent `test-engineer`** (three layers, frameworkless, no mocks) |
| Close a plan or thread | `.claude/commands/plan-closeout.md` (also Plan closeout in the studio composer's More Tools (+) menu, and Finalize & close out) |
| Turn an accepted idea/brainstorm into a loopable build plan | `.claude/commands/create-dispatch-command.md` — plan.md carries phases + progress; run via `/loop /dispatch-<slug>-next-phase` |
| Capture facts/guardrails | **agent `wiki-librarian`** → `wiki/` + one line in `wiki/log.md` per edit |
| Find or ingest craft | `.claude/commands/discover-skills.md` (also Discover skills in the studio composer's More Tools (+) menu; web branch ingests new skills) |
| Recurring task with no procedure | `.claude/commands/new-command.md` — asked twice = failure |
| Add a UI theme | `.claude/commands/add-theme.md` |
| Explain the tool to a human | `wiki/user-guide.md` (with its SVG diagrams) |

## The 12 universal rules

1. **The wiki at `wiki/` is authoritative.** Facts and guardrails live there, not in chat
   history. When code and wiki disagree, stop and reconcile — never silently drift.
2. **Every wiki edit is logged** — append one line to `wiki/log.md` (date, page, what, why).
3. **Plans live in `discussion/<slug>-<yyyy-mm-dd>/plan.md`.** Any multi-step task gets
   one before implementation. Plans close ONLY via `/plan-closeout`: verify → harvest
   learnings → **improve the commands/skills the learnings implicate** → wiki update →
   archive to `_completed/`.
4. **Agentic learnings persist to `.agents/learnings.md`** — non-obvious discoveries only.
   If you learned it the hard way, write it down; the next session must not re-learn it.
5. **`packages/protocol` is the single source of truth for message shapes.** The MCP server
   and the studio import from it; neither redeclares a shape. A shape change updates the
   package, both consumers, tests, and the wiki.
6. **No fake-success.** No function — and no harness — that fabricates output as if a real
   provider produced it. Honest errors (or explicit `pending` / "no generator attached")
   over fake results.
7. **Every SVG presented to the user is captured** with provenance (thread, round, parents),
   plus the thread's append-only `brainstorm.md` text memory. Nothing is ever regenerated.
8. **Untrusted SVG is sanitized before render** (no scripts, event handlers, foreignObject,
   javascript: hrefs).
9. **Surgical changes, simplicity first.** No abstractions for single-use code, no
   unrequested flexibility. Every changed line traces to the request.
10. **Proof is a run, not a claim.** `npm run build` + `npm test` (all three layers) before
    any completion claim; UI claims additionally need the studio loaded (`npm run preview`).
    Features ship WITH tests.
11. **Route work through the specialized layers.** Before doing anything by hand, check
    whether a command (`.claude/commands/`), skill (`.claude/skills/`), or agent
    (`.claude/agents/` — roster in `wiki/System/agents.md`) owns it, and use it. All
    intelligence lives in Claude + these layers — harness/test code stays dumb (fixtures
    only). Delegated generation goes to `svg-artisan`; diagnosis to `devops-diagnostician`;
    orchestration is never delegated.
12. **Docs move with the product.** A change to what humans see or do updates
    `wiki/user-guide.md` (and its diagrams) in the same change; a change to facts or
    contracts updates the wiki (rule 2 applies).

## Appendix — workspace structure

```
packages/protocol/     zod schemas + types — THE message shapes (rule 5)
apps/mcp/              stdio MCP server + bridge (http/WS) + session persistence + preview harness
apps/studio/           Vite + React + Tailwind survey UI (six phase surfaces)
wiki/                  AUTHORITATIVE facts & guardrails (log.md discipline; System/, Product/,
                       Requirements/, Research/, Meta/)
wiki/user-guide.md    human documentation (SVG-illustrated)
discussion/      plans + brainstorm thread cache (dirs with session.json);
                       _completed/ archive; .logs/ runtime logs
.agents/learnings.md   hard-won gotchas (newest first)
.claude/commands/      repeatable procedures — living documents improved on every closeout
.claude/skills/        binding craft (svg-authoring, brainstorm-phases)
.claude/agents/        specialized subagents (devops-diagnostician, svg-artisan,
                       test-engineer, wiki-librarian)
tests/ + scripts/      unit tests (node:test) + smoke.mjs + ui-smoke.ts
.mcp.json              registers this repo's own MCP server (dogfooding)
visual-brainstorm.config.json   targetRepo / styles / theme / models / discussionDir
```

## Appendix — stdio discipline

`apps/mcp` speaks MCP over **stdout**. Nothing in that app may `console.log`; diagnostics go
to `console.error` and the FileLog (ring served at `GET /api/logs`). One stray stdout write
corrupts the protocol stream.
