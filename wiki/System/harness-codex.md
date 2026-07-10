# Harness: Codex (`.codex/` + `.agents/skills/` adapter)

Codex support is a thin adapter over the authoritative `.claude/` layer, not a competing
workflow system. Project Codex configuration and hooks live in `.codex/`; Codex custom
subagents live in `.codex/agents/*.toml`; Codex-discoverable skills mirror the authoritative
craft files in `.agents/skills/`.

The Codex MCP definitions live in `.codex/config.toml`; `.codex/mcp.json` is not a Codex
configuration file in this repository.

**Entry point.** Start Codex from the repo root after the project is trusted. Codex reads
`AGENTS.md` (specifically §8 "Codex Parity" — the Codex-facing summary of this contract),
then the repo-scoped `.codex/config.toml` and `.codex/hooks.json`. The config
registers the same two local MCP servers as `.mcp.json`:

| MCP server | Command | Working directory |
|---|---|---|
| `visual-brainstorm` | `node apps/mcp/dist/index.js` | project root via `cwd = ".."` |
| `visual-brainstorm-wiki` | `node apps/wiki-mcp/dist/index.js` | project root via `cwd = ".."` |

Codex project config and hooks load only for trusted projects, so an untrusted checkout still
needs manual MCP setup before the studio workflow can run.

## Agents

`.codex/agents/` adapts the five authoritative specialist personas as **thin pointer wrappers**.
Each `.codex/agents/*.toml` file carries only `name`, `description`, and `developer_instructions`
that direct the agent to read and follow its authoritative sources; no workflow logic is copied
inline. A copied body is drift: the `.claude/agents` files are living documents improved at
every closeout.

| Codex agent | Authoritative sources (referenced in developer_instructions) |
|---|---|
| `brainstorm-orchestrator` | `.claude/agents/brainstorm-orchestrator.md` + `.claude/commands/run-brainstorm.md` |
| `devops-diagnostician` | `.claude/agents/devops-diagnostician.md` + `.claude/commands/diagnose-studio.md` |
| `svg-artisan` | `.claude/agents/svg-artisan.md` + `.agents/skills/svg-authoring/SKILL.md` |
| `test-engineer` | `.claude/agents/test-engineer.md` + `.claude/commands/build-check.md` |
| `wiki-librarian` | `.claude/agents/wiki-librarian.md` + wiki grounding contract |

Each TOML must reference `.claude/agents/<name>.md` (guard-enforced), point at `.claude/commands`
procedures and `.agents/skills` craft, and never inline a copied body. A `.Codex/...` path is a
bug: that directory does not exist.

## Skills

`.agents/skills/` mirrors the `.claude/skills/` craft files exactly so Codex can discover
the same reusable instructions:

| Skill | Source |
|---|---|
| `brainstorm-phases` | `.claude/skills/brainstorm-phases/SKILL.md` |
| `svg-authoring` | `.claude/skills/svg-authoring/SKILL.md` + `VALIDITY-SCAN.md` |
| `reading-scribbles` | `.claude/skills/reading-scribbles/SKILL.md` |
| `caveman` | `.claude/skills/caveman/SKILL.md` |

## Hooks

`.codex/hooks.json` mirrors the useful Claude hooks with Codex-safe commands:

| Event | Command |
|---|---|
| `PostToolUse` / `SubagentStop` / `Stop` | `node scripts/pipe-progress.mjs` |
| `PostToolUse` on file edits | `node scripts/check-agentic-surface.mjs --hook` |
| `PostToolUse` on file edits | `node scripts/check-copilot-parity.mjs --hook` (cross-harness, rule 11) |
| `PostToolUse` on file edits | `node scripts/check-codex-parity.mjs --hook` |

Do not use Claude-specific environment variables such as `CLAUDE_PROJECT_DIR` in Codex hooks.

## Coverage Honesty

The repo proves Codex adapter consistency with two tools:

- **`tests/codex-adapter.test.mjs`** — asserts that MCP config starts from the project root,
  hooks are Codex-safe (no `CLAUDE_*` env vars) and run the four required commands, each
  `.codex/agents/*.toml` points back to its authoritative `.claude/agents/<name>.md` file
  (guard-enforced), and `.agents/skills` mirrors `.claude/skills` exactly.

- **`npm run check:codex-parity`** — the deterministic Codex parity guard (`scripts/check-codex-parity.mjs`),
  hooked after file edits on both harness sides; in `--hook` mode it fires only when an edited path
  is Codex-relevant (`.codex/`, `.agents/skills/`, `.claude/skills/`, `.claude/agents/`, `AGENTS.md`,
  the surface registry, or this wiki page). It checks MCP config, hooks discipline, agent roster
  pointer-wrapper compliance, and skills parity.

Codex does not get separate copies of `.claude/commands`; agents read and execute those
plain-file procedures. That is intentional: `.claude/` remains the behavioral SSOT.
