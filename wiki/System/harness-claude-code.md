# Harness: Claude Code (native + authoritative SSOT)

Claude Code reads the `.claude/` layer natively — it is BOTH this repo's native harness surface
AND the provider-neutral behavioral SSOT that every other harness adapter wraps (rule 11,
[agentic-loop.md](../Meta/agentic-loop.md)). Other harness pages map ONTO this one; workflow
logic lives here, never duplicated into an adapter. One page per harness — a new harness
(CODEX/Cursor) gets its own `System/harness-<name>.md`, so no harness bloats another's read.

**Entry point.** A cold session reads `CLAUDE.md` §Session bootstrap → its quick map → the wiki
(grounded via the `visual-brainstorm-wiki` MCP, [wiki-grounding.md](wiki-grounding.md)) → the
skill for the task. No chat history required ([agentic-loop.md](../Meta/agentic-loop.md)
§Cold-start guarantee).

**Machine-readable index.** `.claude/agentic-surface-registry.json` is the provider-neutral
surface map adapters read: **15 command surfaces + 2 skills + 5 agents**, plus an `exclusions`
block for the two generated `dispatch-*-next-phase` dispatchers — all 17 on-disk commands
accounted for. A deterministic guard (`scripts/check-agentic-surface.mjs`, wired as a
`Write|Edit` PostToolUse hook + covered by `tests/agentic-surface.test.mjs`) BLOCKS adding a
durable `.claude` file without registering it, and warns when a registry command/agent has no
Copilot adapter unless the registry marks that gap as intentionally excluded — so this drift
cannot recur without noisy false alarms (rule 11).

## Agents (`.claude/agents/`, 5)

Full roster with model tiers + when-to-use: [agents.md](agents.md). Not duplicated here.

## Commands (`.claude/commands/`, 17)

| Command | Model | Purpose | In registry? |
|---|---|---|---|
| run-brainstorm | opus | Drive a full visual brainstorm session | yes |
| plan-closeout | sonnet | Close the active plan and feed learnings back into the repo | yes |
| discover-skills | sonnet | Find local skills or ingest new craft | yes |
| diagnose-studio | sonnet | Diagnose the studio, bridge, or MCP from evidence | yes |
| artifact-chat | haiku | Route artifact questions and revisions through subagents | yes |
| read-mindmap | sonnet | Read a persisted mind map off disk and synthesize the user's intent | yes |
| read-scribble | inherit | Read an annotated-photo scribble off disk and synthesize the user's intent | yes |
| reopen | sonnet | Move a completed thread back to live discussion and resume it | yes |
| build-check | haiku | Run the canonical build and test verification | yes |
| new-command | sonnet | Codify recurring work as a new repeatable command | yes |
| create-dispatch-command | sonnet | Turn a plan into a loopable dispatcher command | yes |
| compress-learnings | sonnet | Compact the agentic learnings log (recent verbatim, older distilled) | yes |
| wiki-maintenance | sonnet | Cross-plan wiki lint/reconcile sweep (delegates to wiki-librarian) | yes |
| add-theme | haiku | Add or ingest a studio theme | yes |
| revisit-round | inherit | Handle the user re-answering a previous round | yes |
| dispatch-comprehensive-human-testing-next-phase | sonnet | One loop tick of that build plan | excluded (generated) |
| dispatch-concierge-living-gallery-next-phase | sonnet | One loop tick of that build plan | excluded (generated) |

The two `dispatch-*` commands are per-plan dispatchers scaffolded by `create-dispatch-command`
and archived on closeout — they sit in the registry's `exclusions` block, not `surfaces`.
`add-theme` and `revisit-round` are durable but intentionally unadapted in Copilot today, so the
registry records them under `exclusions.copilot.commands`; a new durable command that is neither
adapted nor excluded still surfaces as a parity warning.

## Skills (`.claude/skills/`, 2)

| Skill | Purpose |
|---|---|
| brainstorm-phases | Drive the five-phase funnel and interpret every response field |
| svg-authoring | Author divergent SVG board options and validate them |

Skills are craft loaded by a caller (agent/command), not standalone workflows.
