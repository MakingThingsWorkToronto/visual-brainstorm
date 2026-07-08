# Agentic layer — token-efficient model tiering

- **Date:** 2026-07-07
- **Scope:** Add `model:` frontmatter to every `.md` in `.claude/` (agents, commands, skills), picking the most token-efficient model that can do each job. Opus reserved for orchestrator + security + long-run work. Add a token-efficiency guardrail to the wiki.
- **Authority:** Operator directive (`/goal make agentic layer token efficient and optimize for agentic use`); donor tiering pattern at `C:\Code\tp\.claude` (agents carry `model:`; security-engineer → opus; light ops → haiku).
- **Status:** closed 2026-07-07 — BUILD landed in `9877356`; closeout harvested 1 learning block, improved `/new-command` + `/create-dispatch-command` (both now stamp a model tier on what they author), verified (build + smoke green).

## Tiering rule
`haiku` mechanical/deterministic/routing · `sonnet` reasoning/generation/build · `opus` orchestrator + security + long-run · `inherit` reference skills & orchestrator sub-procedures (never downgrade the caller). Values are tier **aliases** (auto-track the best current model per tier).

## Assignments
### Agents
- brainstorm-orchestrator → **opus** (orchestrator + long-run session driver)
- svg-artisan → **opus** (operator directive 2026-07-07: best possible board-SVG quality — the artifact the human judges; still dynamically routed by `BoardResponse.model` per round)
- test-engineer → **sonnet** (correct test authoring)
- devops-diagnostician → **sonnet** (evidence root-causing)
- wiki-librarian → **haiku** (mechanical fact transcription + log discipline)

### Commands
- run-brainstorm → **opus** (drives the full multi-round brainstorm)
- plan-closeout, create-dispatch-command, new-command, discover-skills, diagnose-studio, dispatch-comprehensive-human-testing-next-phase, dispatch-concierge-living-gallery-next-phase → **sonnet**
- artifact-chat, build-check, add-theme → **haiku** (routing / mechanical)
- revisit-round → **inherit** (sub-step inside an active orchestrator brainstorm — keep its opus)

### Skills
- brainstorm-phases, svg-authoring → **inherit** (reference craft; loaded by an agent that already owns the right model — never hijack the turn)

## Steps
1. [x] Stamp `model:` into all 5 agents
2. [x] Add frontmatter (`model`) to all 12 commands
3. [x] Add `model: inherit` to the 2 skills
4. [x] Wiki: new `System/model-tiering.md` guardrail + `System/agents.md` Model column + README index + log.md
5. [x] Verify: `npm run build` green; `npm test` unit/smoke/ui-smoke green (human-sim layer un-runnable here — no CDP-capable browser in this shell; env limitation, not a regression)
