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

Both `.vscode/mcp.json` and the root `.mcp.json` deliberately omit
`VIBR_COPILOT_HOSTED`; the local route must keep the bridge and human-accessible interactive
studio enabled.

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

The product `visual-brainstorm` entry in that payload, and every GitHub agent-scoped
`mcp-servers` declaration that exposes the product server, set literal
`VIBR_COPILOT_HOSTED=1`. `apps/mcp/src/index.ts` treats that as a runtime safety boundary: it
returns `{ status: "unsupported-host" }` for `open_studio`, `ask_concierge`,
`present_gallery`, and `present_board` before creating a session or starting the bridge. This is
enforced runtime behavior, not prompt prose alone.

`.github/workflows/copilot-setup-steps.yml` runs `npm ci`, then `npm run build`, followed by
`npm run check:copilot-parity`, `node --test tests/copilot-mcp.test.mjs`, and
`node --test tests/copilot-adapter.test.mjs`. Its push and pull-request path filters explicitly
include `.github/agentic-surface-registry.json`, `.github/prompts/**`, and
`tests/copilot-adapter.test.mjs`, alongside the other parity-owned workflow, manifest, hook,
agent, instruction, registry, test, and script paths. The MCP checks prove startup and parity;
the adapter test proves the authoritative registry -> Copilot adapter registry -> prompt/agent
wrapper chain. Cloud servers still run inside an ephemeral Actions runner, where the product
bridge would be runner-local `127.0.0.1`; the runtime refusal prevents a hidden runner bridge
from being treated as an interactive journey. The read-only wiki server and other noninteractive
MCP operations remain useful.

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
`tests/copilot-mcp.test.mjs` additionally checks the parity guard and, for every configured
server in both manifests, performs real stdio `initialize` -> `notifications/initialized` ->
`tools/list` discovery against its declared command and environment. With
`VIBR_COPILOT_HOSTED=1`, it actively calls every browser-dependent product tool — `open_studio`,
`ask_concierge`, `present_gallery`, and `present_board` — and requires each to return
`{ status: "unsupported-host" }` before bridge startup. It also exercises the native hook wrapper
with `{}`, `null`, malformed JSON, and a normal edit payload.

The following remain host-managed manual checks, and are not claimed as automated proof:
- VS Code workspace trust, server start/discovery, and MCP tool and `/` menu behavior.
- GitHub organization policy plus repository MCP-settings and custom-agent acceptance.
- GitHub runner working-directory and host-service behavior.
