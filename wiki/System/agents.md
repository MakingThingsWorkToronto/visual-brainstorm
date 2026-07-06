# Specialized Agents (`.claude/agents/`)

Subagents with scoped tools and embedded procedure. Use them instead of ad-hoc work.

| Agent | Use when | Notes |
|---|---|---|
| `devops-diagnostician` | studio/preview/bridge/MCP "seems broken", hangs, stale content, port suspicion | evidence-first: /api/health → process census → logs; never restart-loops; kills node pids, not npm wrappers |
| `svg-artisan` | delegated option generation — esp. when `BoardResponse.model` routes a round to a specific model | reads svg-authoring skill; returns pure JSON options; synthesis by MEANING, never overlay |
| `test-engineer` | features land/change (tests ship with features), failures, coverage doubts | knows the three layers + conventions; frameworkless; no mocks |
| `wiki-librarian` | authoritative facts need capturing, closeout doc steps, wiki/code drift | enforces rule 1 authority + rule 2 log discipline; owns command/skill changelog footers |

Model delegation flow: user picks a model in the composer → `BoardResponse.model` →
orchestrator spawns `svg-artisan` with that model override → artisan returns options JSON →
orchestrator presents the board. The orchestrator never stops orchestrating; only
generation is delegated.
