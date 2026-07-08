# Provider-aware harness support — Copilot now, CODEX-ready

**Date:** 2026-07-07
**Scope:** Rework the repo's command-discovery and engine/provider seams so Visual Brainstorm can expose its real workflows to GitHub Copilot now, while staying honest about the current as-built Claude-only runtime and preparing a clean path for future CODEX support.
**Authority:** user request; [CLAUDE.md](CLAUDE.md) rules 1, 3, 5, 10, 11, and 12; [AGENTS.md](AGENTS.md) rules 1, 4, 5, and 6; [wiki/Meta/conventions.md](wiki/Meta/conventions.md); [wiki/Requirements/system-architecture.md](wiki/Requirements/system-architecture.md); [wiki/Requirements/interaction-protocol.md](wiki/Requirements/interaction-protocol.md); [wiki/System/agents.md](wiki/System/agents.md); [wiki/System/model-tiering.md](wiki/System/model-tiering.md); [wiki/System/interface-coverage.md](wiki/System/interface-coverage.md)
**Status:** open — authority registry + Copilot adapter slices landed; provider-aware protocol/config and studio model seam landed; MCP engine-adapter extraction and CODEX-referenceable closeout still pending
**Owner persona:** inline coordinator; BUILD delegated as needed to agent-customization, test-engineer, and wiki-librarian surfaces

## Intent

Do NOT bolt Copilot prompts onto the side of a Claude-only system. Re-anchor on the repo's
real authority surfaces, then add harness adapters in a way that preserves one source of
truth for behavior, keeps the MCP/studio interactivity model intact, and leaves a clean seam
for future non-Claude engines such as CODEX.

## Fresh-eyes pass 1 — what `.claude/` actually is

The repo already distinguishes three different kinds of agentic surface, and the plan must
respect that split.

| Surface | Location | What it is | Frontmatter as built | Why it matters |
|---|---|---|---|---|
| Commands | `.claude/commands/*.md` | repeatable operator procedures / workflows | `model:` only | these are the repo's actual workflow entry points; "slash command" in this repo currently means these files, not Copilot prompt files |
| Skills | `.claude/skills/*/SKILL.md` | craft knowledge loaded by a caller | `name`, `description`, `model: inherit` | they are not user workflows; they teach a caller how to do one part of the work |
| Agents | `.claude/agents/*.md` | specialist personas with keep/delegate contracts | `name`, `description`, `model` | they own roles, not top-level chat discovery |

Concrete evidence:

1. `.claude/commands/run-brainstorm.md` is the full end-to-end workflow.
2. `.claude/commands/plan-closeout.md` is the closeout workflow.
3. `.claude/commands/discover-skills.md` explicitly defines commands as "repeatable procedures"
   and skills as "craft knowledge."
4. `.claude/commands/new-command.md` says new repeatable work belongs in `.claude/commands/`
   and craft belongs in `.claude/skills/`.
5. `.claude/skills/brainstorm-phases/SKILL.md` and `.claude/skills/svg-authoring/SKILL.md`
   are reference skills with `model: inherit`, matching the wiki's model-tiering rule.
6. `.claude/agents/brainstorm-orchestrator.md` is the persona that owns orchestration and
   delegates heavy procedures downward.

**Locked decision 1:** `.claude/` remains the authoritative behavior layer. Any Copilot or
future CODEX surface is an adapter over these files, not a second source of workflow truth.

## Fresh-eyes pass 2 — what the MCP/runtime already does

The interactivity stack is already more general than the current engine labeling, but the
repo is still explicitly Claude-only in its intelligence layer.

1. `packages/protocol` is the source of truth for message shapes. Any provider/harness shape
   change must start there.
2. `apps/mcp` already exposes the full interactive workflow over MCP tools:
   `open_studio`, `ask_concierge`, `present_gallery`, `present_board`, `peek_response`,
   `capture_artifact`, `compose_poster`, `reply_artifact_chat`, `list_discussions`,
   `load_discussion`, and `session_status`.
3. `apps/studio` is already a generic browser surface driven by WS + HTTP; it never talks MCP
   directly.
4. The bridge and config are still local-machine oriented: loopback `127.0.0.1`, local
   `discussion/`, local target-folder validation, local `.mcp.json` registration, and a local
   Windows example in README. This repo does not yet promise remote/shared harness use.
5. `wiki/Requirements/system-architecture.md` states the non-negotiable as built: **One
   engine: Claude**. The shared state no longer carries a live `StudioState.engine`
   discriminator; runtime truth is "real Claude-backed orchestration only," with provider-aware
   runtime/model metadata now carried separately.
6. The old preview harness has been deleted. Fixtures still exist only as tests/harnesses, not
   as a second interactive runtime.

**Locked decision 2:** keep the MCP/studio interaction backbone. Support for Copilot or future
CODEX must reuse this tool surface, not re-implement brainstorm logic in harness-specific UI
or preview code.

## Fresh-eyes pass 3 — what is still Claude-specific and must change

The current engine/provider assumptions are embedded in config, protocol defaults, UI copy,
and model selection.

1. `visual-brainstorm.config.json` and `apps/mcp/src/config.ts` define `models` as raw
   strings and default them to Claude model IDs only.
2. `BoardResponse.model` is just a free string, which is flexible, but the surrounding UI is
   not: `NewDiscussionPanel.tsx` and `BoardSurvey.tsx` render the picker as Claude-only labels
   by stripping a `claude-` prefix.
3. `App.tsx` and `NewDiscussionPanel.tsx` carried hardcoded "requires the Claude engine"
   copy, which is true today but should hang off runtime metadata rather than literal text.
4. The bridge/config boundary still needed explicit runtime metadata so UI copy and future
   adapters could describe the live orchestrator without reintroducing a fake engine switch.
5. `wiki/System/agents.md` and `wiki/System/model-tiering.md` describe the actual runtime
   model flow: orchestrator remains the owner, while `BoardResponse.model` only overrides the
   delegated generation step.

**Locked decision 3:** future harness work must separate:

- the **engine** that orchestrates the workflow,
- the **provider/model catalog** shown in the UI,
- and the **delegated generation route** chosen for the next round.

The current raw-string model list is not enough for multi-harness support.

## Architecture decisions locked by this plan

1. **Single source of truth:** `.claude/commands`, `.claude/skills`, and `.claude/agents`
   stay authoritative for procedure, craft, and persona respectively.
2. **Adapters, not forks:** Copilot and future CODEX layers will be thin discovery/execution
   adapters that reference `.claude` authority and the MCP tool layer. They must not invent
   alternate procedures.
3. **Provider-neutral registry required:** add a deterministic repo-local registry of the
   authoritative agentic surfaces and their frontmatter metadata so external layers can refer
   to them without scraping ad hoc markdown. Minimum contents: kind (`command|skill|agent`),
   name/path, model tier, short purpose, and owning workflow.
4. **Engine/provider schema belongs in `packages/protocol`:** runtime and model metadata live
   there first, then flow through MCP and studio.
5. **Model selector becomes structured:** replace raw `models: string[]` / `defaultModel`
   with a structured model catalog in config + state. Minimum fields: stable id, label,
   provider, engine compatibility, and whether it is an orchestration default or a delegated
   generation target.
6. **Claude remains the first real engine until another exists:** no fake CODEX support, no
   preview pseudo-intelligence, no empty "supports multiple providers" claim. If a future
   CODEX adapter lacks a confirmed host format, mark that layer `blocked-external` and still
   land the shared registry/schema work.
7. **Copilot first, CODEX-ready second:** Copilot workspace integration is implementable now
   because its prompt/agent file formats are known. CODEX must be planned into the seams now,
   but its final adapter layer only lands when the target harness contract is concrete.
8. **Local-first honesty:** the first implementation target remains local harnesses on this
   machine/workspace. Remote/cloud/shared-session support is out of scope for this plan.

## First-wave workflow surface

These remain the user-facing workflows to expose through adapters:

1. `/run-brainstorm`
2. `/plan-closeout`
3. `/discover-skills`
4. `/diagnose-studio`
5. `/artifact-chat`
6. `/reopen`
7. `/build-check`

Second-wave workflows: `/new-command`, `/create-dispatch-command`, `/add-theme`.

## Implementation phases (loopable)

| # | Phase | Deliverable | Status |
|---|---|---|---|
| 1 | **Lock the authority map** | Add a provider-neutral agentic registry for the `.claude` surfaces and document the taxonomy explicitly: commands = repeatable workflows, skills = craft knowledge, agents = specialist personas. The registry is the stable reference target for external harness layers and must match the wiki/interface ownership tables. | completed |
| 2 | **Widen protocol + config for provider-aware engines** | In `packages/protocol` and config loading, replace the Claude-only engine/model assumptions with structured shapes. Runtime metadata must be explicit and model choices can no longer be raw Claude strings only. Preserve current Claude defaults while making the schema admit future engines/providers honestly. | completed |
| 3 | **Refactor the studio for engine-aware UX** | Update `apps/studio` so labels, pickers, and prompts describe the active engine/provider truthfully. Remove hardcoded "requires the Claude engine" copy where the surface is actually generic; keep explicit Claude-only warnings only where the runtime truly remains Claude-only. The model picker must render provider-neutral labels from structured model metadata, not string prefix hacks. | completed |
| 4 | **Extract the runtime adapter seam in MCP** | Refactor `apps/mcp` so the existing Claude orchestration path is treated as one engine adapter over the same MCP/studio backbone. `preview` stays a dumb fixtures harness. The seam must make it clear what a second real engine would need to implement without duplicating bridge/session logic. | pending |
| 5 | **Add the Copilot workspace adapter** | Create the `.github` discovery layer for Copilot using prompt/agent wrappers that reference the authoritative `.claude` surfaces and the registry from phase 1. No workflow logic duplication. Any internal `.claude` skill that should not appear directly in Copilot slash discovery gets explicitly hidden there or mirrored behind curated prompts. | completed |
| 6 | **Make the agentic architecture CODEX-referenceable** | Add the docs/registry/contracts a future CODEX adapter would need: authoritative surface map, engine/model schema, workflow-to-tool mapping, and harness expectations. If a concrete CODEX customization format is available, scaffold the wrapper layer; if not, land the referenceable architecture and mark the actual wrapper runtime `blocked-external` rather than guessing. | pending |
| 7 | **Verification across real and dumb harnesses** | Prove the refactor did not break the product: `npm run build`, `npm test`, and real human verification for the live Claude path. Also verify the preview harness stays dumb and honest. Copilot verification: workspace slash commands appear and can drive the existing MCP tools. If CODEX adapter work is still external-blocked, report exactly what is verified vs deferred. | pending |
| 8 | **Docs + authority reconciliation** | Update README and the relevant wiki pages with the authoritative architecture: what `.claude` owns, what Copilot owns, what future CODEX would own, what remains local-only, how engines/providers/models are represented, and what the current support matrix actually is. Append `wiki/log.md` for every wiki edit. | pending |

## Exit criteria

- `.claude` remains the single source of truth for workflows, craft, and personas.
- The repo has a stable registry/reference surface external harness adapters can point at.
- The protocol/config/UI no longer assume Claude-only model IDs even while Claude remains the
  only implemented real engine.
- The MCP/studio interactivity model remains one backbone reused by adapters.
- GitHub Copilot can expose the intended workflows through workspace-local adapters without
  duplicating repo behavior.
- The plan leaves a concrete, honest seam for future CODEX support and explicitly marks any
  still-external wrapper work as external, not "done."
- The preview harness remains non-intelligent.
- `npm run build` and `npm test` pass after implementation.

## Non-goals / honest boundaries

1. This plan does not promise GitHub-hosted global slash commands outside workspace
   customization.
2. This plan does not promise remote/shared/cloud runtime support; the as-built product is
   local-machine and loopback-first.
3. This plan does not fabricate CODEX support before a concrete host integration format is
   known.

## Progress log (append-only)

- 2026-07-07 — initial plan created as a Copilot slash-command review.
- 2026-07-07 — fresh-eyes pass 1: re-anchored to `.claude`; differentiated commands,
  skills, and agents from their own files and frontmatter (`run-brainstorm.md`,
  `plan-closeout.md`, `discover-skills.md`, `new-command.md`, `brainstorm-phases/SKILL.md`,
  `svg-authoring/SKILL.md`, `brainstorm-orchestrator.md`).
- 2026-07-07 — fresh-eyes pass 2: re-read the authoritative architecture and interaction
   docs (`wiki/Requirements/system-architecture.md`, `wiki/Requirements/interaction-protocol.md`,
   `wiki/System/agents.md`, `wiki/System/model-tiering.md`, `wiki/System/interface-coverage.md`) and
   confirmed the as-built runtime is one real Claude-backed engine over MCP, with no second
   interactive harness path.
- 2026-07-07 — fresh-eyes pass 3: studied the as-built MCP/runtime and UI seams
  (`.mcp.json`, `apps/mcp/src/index.ts`, `bridge-server.ts`, `preview.ts`, `config.ts`,
  `visual-brainstorm.config.json`, `useBridge.ts`, `App.tsx`, `NewDiscussionPanel.tsx`,
  `BoardSurvey.tsx`, `packages/protocol/src/index.ts`) and widened the plan from a narrow
  Copilot wrapper task to provider-aware harness architecture with Copilot now and CODEX-ready seams.
- 2026-07-07 — BUILD slice landed for immediate GitHub Copilot use without disturbing the Claude implementation: added `.github/copilot-instructions.md`, `.github/agentic-surface-map.json`, thin `.github/agents/*.agent.md` wrappers, and `.github/prompts/*.prompt.md` slash-command adapters pointing back to `.claude` as SSOT; README/user-guide/system-architecture updated to document the current local-only Copilot adapter and the still-pending provider-aware engine seam.
- 2026-07-07 — authoritative loop rule landed: `CLAUDE.md`, `wiki/Meta/agentic-loop.md`, `wiki/Meta/conventions.md`, and `.claude/commands/plan-closeout.md` now require supported harness adapters to be reconciled when authoritative workflows, protocol contracts, or harness-visible behavior change, while explicitly allowing a skip when a plan does not touch adapter-visible seams.
- 2026-07-07 — BUILD slice landed for phases 2 and 3: `packages/protocol` now carries structured runtime/model metadata, `apps/mcp/src/config.ts` and `visual-brainstorm.config.json` normalize a model catalog instead of raw strings, the bridge serves runtime + model metadata over `/api/state`/`hello`, and the studio renders picker/history labels from that metadata rather than stripping `claude-` prefixes. Claude remains the only implemented live engine; the MCP orchestration path itself is not yet adapter-extracted.