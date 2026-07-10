# Harness: Cursor (`.cursor/` adapter)

Cursor support is a thin adapter over the authoritative `.claude/` layer, not a competing
workflow system. Project Cursor configuration lives in `.cursor/`; workflow logic stays in
`.claude/commands`, `.claude/skills`, and `.claude/agents`.

**Entry point.** Open this repo in Cursor. After `npm install` and `npm run build`, reload the
window so `.cursor/mcp.json` loads. The always-on rule `.cursor/rules/visual-brainstorm.mdc`
carries bootstrap + routing. Type `/` in Agent chat to reach slash commands.

| MCP server | Command | Working directory |
|---|---|---|
| `visual-brainstorm` | `node apps/mcp/dist/index.js` | `${workspaceFolder}` |
| `visual-brainstorm-wiki` | `node apps/wiki-mcp/dist/index.js` | `${workspaceFolder}` |

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
| `postToolUse` on Task / visual-brainstorm MCP | `node scripts/pipe-progress.mjs` |
| `postToolUse` on file edits | `node scripts/check-agentic-surface.mjs --hook` |
| `subagentStop` / `stop` | `node scripts/pipe-progress.mjs` |

## Coverage honesty

The repo proves Cursor adapter consistency with `tests/cursor-adapter.test.mjs`: MCP config
starts from the project root, hooks are not Claude-specific, commands map to the authoritative
registry, and both stdio servers initialize with the expected tool inventories.

Cursor does not get separate copies of `.claude/commands`; agents read and execute those
plain-file procedures. That is intentional: `.claude/` remains the behavioral SSOT.
