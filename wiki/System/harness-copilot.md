# Harness: GitHub Copilot (`.github/` adapter)

Workspace-local Copilot customizations in `.github/` are THIN ADAPTERS over the authoritative
`.claude/` layer (rule 11), not a second source of workflow truth. When a `.github` prompt or
agent references a `.claude` file, read that file and run its logic — never paraphrase it into a
duplicate procedure. SSOT + full command/skill roster: [harness-claude-code.md](harness-claude-code.md).

**Entry point.** In VS Code, open Copilot Chat and type `/` to reach the workspace prompts;
custom agents are selectable in the chat agent picker. Bootstrap order
(`.github/copilot-instructions.md`): `wiki/README.md` + task page → `CLAUDE.md` → the current
harness plan → `.claude/agentic-surface-registry.json` (provider-neutral) →
`.github/agentic-surface-registry.json` (Copilot adapter registry).

**Adapter registry.** `.github/agentic-surface-registry.json` records each Copilot surface and its `.claude`
source; `.github/copilot-instructions.md` carries the bootstrap + runtime rules.

## MCP routes

### Local VS Code Copilot Chat (supported interactive path)

`.vscode/mcp.json` is the discoverable VS Code workspace manifest. It uses VS Code's
`servers` schema to define both local stdio servers, with `cwd: ${workspaceFolder}`:
`visual-brainstorm` (`node apps/mcp/dist/index.js`) and `visual-brainstorm-wiki`
(`node apps/wiki-mcp/dist/index.js`).

After dependencies are installed and `npm run build` has produced `dist`, trust the workspace,
then use **MCP: List Servers** to start and trust both servers. This is the fully interactive
supported path: the bridge's local `127.0.0.1` studio is reachable by the human on the same
machine, so a board can receive a human response.

### GitHub-hosted Copilot (noninteractive runner path)

`.github/mcp.json` is a versioned GitHub-compatible `mcpServers` payload. Its server entries
carry explicit tool allowlists. GitHub.com does **not** automatically discover that file:
GitHub-hosted Copilot receives equivalent configuration from the relevant
`.github/agents/*.agent.md` `mcp-servers` declarations, or an administrator can paste the
payload into repository **Settings > Copilot > MCP servers**.

`.github/workflows/copilot-setup-steps.yml` runs `npm ci` and `npm run build`, allowing cloud
agents to launch the dist-based stdio commands. Those servers run inside an ephemeral Actions
runner, where the product bridge listens on runner-local `127.0.0.1`. The runner cannot expose
the Visual Brainstorm browser studio to a human or collect a human board response. Do not report
`open_studio`, `ask_concierge`, `present_gallery`, or `present_board` as a completed interactive
brainstorm there. The read-only wiki server and other noninteractive MCP operations remain useful.

## Authority mirror and native hooks

`.github/copilot-instructions.md` dynamically reads the applicable `CLAUDE.md` and `AGENTS.md`
mandates instead of duplicating them. It names only host-specific exceptions: workspace-relative
paths replace `$CLAUDE_PROJECT_DIR`, `.github/hooks/` uses native VS Code events, and hosted
loopback is not human-reachable. A Copilot-run tool call is a Copilot action, not a Claude-engine
run merely because product runtime metadata may still mention Claude.

`.github/hooks/visual-brainstorm.json` is the VS Code-native equivalent of the Claude hook
outcomes. Its wrapper forwards progress for product MCP and subagent activity, runs the
agentic-surface guard after file mutations, and has the Copilot parity guard evaluate only
authority/adapter paths: `CLAUDE.md`, `AGENTS.md`, `.github/`, and `.vscode/`.
`.vscode/settings.json` suppresses automatic loading of `.claude/settings.json`; otherwise VS
Code loads the Claude hooks while ignoring their matchers, causing duplicate or over-broad runs.

## Prompts → commands (13 of 17 commands adapted)

Each `.github/prompts/<name>.prompt.md` wraps `.claude/commands/<name>.md` and routes to a
Copilot agent:

| Copilot prompt | → `.claude` command | Copilot agent |
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
Skills (`brainstorm-phases`, `svg-authoring`) have no Copilot wrappers — they are craft the
operator agent loads directly from `.claude/skills/`.

`add-theme` and `revisit-round` are intentionally listed under
`.claude/agentic-surface-registry.json` `exclusions.copilot.commands`, so the guard stays quiet
on those known gaps while still surfacing any newly-unreconciled durable command.

## Agents (5, all adapted)

| `.claude` agent | → Copilot agent (`.github/agents/`) |
|---|---|
| brainstorm-orchestrator | brainstorm-orchestrator |
| devops-diagnostician | devops-diagnostician |
| svg-artisan | svg-artisan |
| test-engineer | test-engineer |
| wiki-librarian | wiki-librarian |

`brainstorm-orchestrator` fronts both the orchestrator persona and most operator commands —
Copilot has no separate orchestrator/generalist split.

## Coverage honesty (rule 6)

The repo proves the authoritative registry → Copilot adapter registry → prompt/agent chain stays aligned; whether the `/`
entries actually surface in the Copilot menu is a VS Code host behavior, spot-checked after host
upgrades ([testing-observability.md](testing-observability.md), [user-guide.md](../user-guide.md)).
`tests/copilot-mcp.test.mjs` additionally checks the parity guard and performs real stdio MCP
`initialize` handshakes for both local commands. That automated proof supplements, rather than
replaces, VS Code host spot checks and GitHub cloud configuration/policy checks.
