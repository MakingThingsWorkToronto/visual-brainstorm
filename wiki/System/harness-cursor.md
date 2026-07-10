# Harness: Cursor (`.cursor/` adapter)

Cursor support is a thin adapter over the authoritative `.claude/` layer, not a competing
workflow system. Project Cursor configuration lives in `.cursor/`; workflow logic stays in
`.claude/commands`, `.claude/skills`, and `.claude/agents`.

**Entry point.** Open this repo in Cursor. After `npm install` and `npm run build`, reload the
window so `.cursor/mcp.json` loads. The always-on rule `.cursor/rules/visual-brainstorm.mdc`
carries bootstrap + routing. Type `/` in Agent chat to reach slash commands.

| MCP server | Entry point |
|---|---|
| `visual-brainstorm` | `${workspaceFolder}/apps/mcp/dist/index.js` (with `env: { VIBR_HOME: "${workspaceFolder}/discussion" }`) |
| `visual-brainstorm-wiki` | `${workspaceFolder}/apps/wiki-mcp/dist/index.js` |

Cursor's `mcp.json` does not support a `cwd` key, so entry paths are workspace-absolute in `args` and the product
server's discussion root is pinned via the `VIBR_HOME` environment variable (read by the server at spawn time). Note:
`visual-brainstorm.config.json` (styles/theme/models/targetRepo) is resolved from the server's spawn cwd, which Cursor
does not guarantee — if custom config seems ignored, that is why (the discussion root itself is safe via VIBR_HOME).

## Slash commands → procedures (13 of 17 adapted)

Each `.cursor/commands/<name>.md` wraps `.claude/commands/<name>.md` and routes to a subagent:

| Cursor command | → `.claude` command | Subagent |
|---|---|---|
| run-brainstorm | run-brainstorm | brainstorm-orchestrator |
| plan-closeout | plan-closeout | brainstorm-orchestrator |
| discover-skills | discover-skills | brainstorm-orchestrator |
| diagnose-studio | diagnose-studio | devops-diagnostician |
| artifact-chat | artifact-chat | brainstorm-orchestrator |
| read-mindmap | read-mindmap | brainstorm-orchestrator |
| read-scribble | read-scribble | brainstorm-orchestrator |
| reopen | reopen | brainstorm-orchestrator |
| build-check | build-check | test-engineer |
| new-command | new-command | brainstorm-orchestrator |
| create-dispatch-command | create-dispatch-command | brainstorm-orchestrator |
| compress-learnings | compress-learnings | brainstorm-orchestrator |
| wiki-maintenance | wiki-maintenance | wiki-librarian |

**Not adapted (4):** `add-theme`, `revisit-round`,
`dispatch-comprehensive-human-testing-next-phase`, `dispatch-concierge-living-gallery-next-phase`.
Skills have no Cursor wrappers — agents load them directly from `.claude/skills/`.

## Agents (5, via Task subagent)

Cursor has no native agent picker like Copilot. Commands delegate to the matching subagent type
defined in `.claude/agents/*.md`:

| `.claude` agent | Subagent type |
|---|---|
| brainstorm-orchestrator | brainstorm-orchestrator |
| devops-diagnostician | devops-diagnostician |
| svg-artisan | svg-artisan |
| test-engineer | test-engineer |
| wiki-librarian | wiki-librarian |

## Hooks

`.cursor/hooks.json` mirrors the useful Claude/Codex hook outcomes:

| Event | Command |
|---|---|
| `postToolUse` on `Task\|MCP:present_board\|MCP:present_gallery\|MCP:capture_artifact\|MCP:ask_concierge\|MCP:compose_poster\|MCP:load_discussion` | `node scripts/pipe-progress.mjs` |
| `afterFileEdit` (every file edit) | `node scripts/check-agentic-surface.mjs --hook` |
| `subagentStop` / `stop` | `node scripts/pipe-progress.mjs` |

## Coverage honesty

The repo proves Cursor adapter consistency with `tests/cursor-adapter.test.mjs`: MCP config
starts from the project root, hooks are not Claude-specific, commands map to the authoritative
registry, both stdio servers initialize with the expected tool inventories, tests assert
Cursor-native matcher syntax (no spaced MCP matcher, `afterFileEdit` present), the manifest's
workspace-absolute args + no `cwd` key + `VIBR_HOME` pin, and the command-exclusion filter reads
the registry's `exclusions.cursor` block via the authoritative `globMatch`.

Cursor does not get separate copies of `.claude/commands`; agents read and execute those
plain-file procedures. That is intentional: `.claude/` remains the behavioral SSOT.
