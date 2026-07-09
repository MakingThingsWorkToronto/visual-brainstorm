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
| run-brainstorm | run-brainstorm | visual-brainstorm-operator |
| plan-closeout | plan-closeout | visual-brainstorm-operator |
| discover-skills | discover-skills | visual-brainstorm-operator |
| diagnose-studio | diagnose-studio | visual-brainstorm-diagnostician |
| artifact-chat | artifact-chat | visual-brainstorm-operator |
| read-mindmap | read-mindmap | visual-brainstorm-operator |
| read-scribble | read-scribble | visual-brainstorm-operator |
| reopen | reopen | visual-brainstorm-operator |
| build-check | build-check | visual-brainstorm-test-engineer |
| new-command | new-command | visual-brainstorm-operator |
| create-dispatch-command | create-dispatch-command | visual-brainstorm-operator |
| compress-learnings | compress-learnings | visual-brainstorm-operator |
| wiki-maintenance | wiki-maintenance | visual-brainstorm-wiki-librarian |

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
| brainstorm-orchestrator | visual-brainstorm-operator |
| devops-diagnostician | visual-brainstorm-diagnostician |
| svg-artisan | visual-brainstorm-svg-artisan |
| test-engineer | visual-brainstorm-test-engineer |
| wiki-librarian | visual-brainstorm-wiki-librarian |

`visual-brainstorm-operator` fronts both the orchestrator persona and most operator commands —
Copilot has no separate orchestrator/generalist split.

## Coverage honesty (rule 6)

The repo proves the authoritative registry → Copilot adapter registry → prompt/agent chain stays aligned; whether the `/`
entries actually surface in the Copilot menu is a VS Code host behavior, spot-checked after host
upgrades ([testing-observability.md](testing-observability.md), [user-guide.md](../user-guide.md)).
