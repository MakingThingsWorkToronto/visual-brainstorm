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
