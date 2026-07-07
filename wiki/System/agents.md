# Specialized Agents (`.claude/agents/`)

Subagents with scoped tools and embedded procedure. Use them instead of ad-hoc work.
The full interface-task → owner map (which agent/command/script owns every UI mechanic)
is `wiki/System/interface-coverage.md`.

| Agent | Use when | Notes |
|---|---|---|
| `brainstorm-orchestrator` | any brainstorm run/resume — the primary persona guiding the human through the five-phase funnel | creative facilitator; delegates ALL heavy procedures (generation → svg-artisan, artifact chat → general/svg-artisan, diagnosis → devops-diagnostician, fact capture → wiki-librarian) to preserve orchestration context; persists brainstorm-routine orchestration learnings in its own agent file (living `## Orchestration learnings` section) |
| `devops-diagnostician` | studio/preview/bridge/MCP "seems broken", hangs, stale content, port suspicion | evidence-first: /api/health → process census → logs; never restart-loops; kills node pids, not npm wrappers |
| `svg-artisan` | delegated option generation — esp. when `BoardResponse.model` routes a round to a specific model | reads svg-authoring skill; returns pure JSON options; synthesis by MEANING, never overlay |
| `test-engineer` | features land/change (tests ship with features), failures, coverage doubts | knows the three layers + conventions; frameworkless; no mocks |
| `wiki-librarian` | authoritative facts need capturing, closeout doc steps, wiki/code drift | enforces rule 1 authority + rule 2 log discipline; owns command/skill changelog footers |

Model delegation flow: user picks a model in the composer → `BoardResponse.model` →
orchestrator spawns `svg-artisan` with that model override → artisan returns options JSON →
orchestrator presents the board. The orchestrator — agent `brainstorm-orchestrator`, the
single owner of brainstorm orchestration — never stops orchestrating; heavy procedures are
delegated downward, orchestration itself never is. Artifact chat (`.claude/commands/artifact-chat.md`) ALWAYS
delegates (operator mandate): questions → a general subagent reading the SVG +
`brainstorm.md`; revision requests → `svg-artisan` (thread model override applies). The
orchestrator only routes the message and delivers the reply
(`reply_artifact_chat` / `capture_artifact` with `revises`) — it never answers or
regenerates inline.
