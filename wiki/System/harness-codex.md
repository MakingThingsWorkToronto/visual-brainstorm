# Harness: Codex (`.codex/` + `.agents/skills/` adapter)

Codex support is a thin adapter over the authoritative `.claude/` layer, not a competing
workflow system. Project Codex configuration and hooks live in `.codex/`; Codex custom
subagents live in `.codex/agents/*.toml`; Codex-discoverable skills mirror the authoritative
craft files in `.agents/skills/`.

The Codex MCP definitions live in `.codex/config.toml`; `.codex/mcp.json` is not a Codex
configuration file in this repository.

**Entry point.** Start Codex from the repo root after the project is trusted. Codex reads
`AGENTS.md`, then the repo-scoped `.codex/config.toml` and `.codex/hooks.json`. The config
registers the same two local MCP servers as `.mcp.json`:

| MCP server | Command | Working directory |
|---|---|---|
| `visual-brainstorm` | `node apps/mcp/dist/index.js` | project root via `cwd = ".."` |
| `visual-brainstorm-wiki` | `node apps/wiki-mcp/dist/index.js` | project root via `cwd = ".."` |

Codex project config and hooks load only for trusted projects, so an untrusted checkout still
needs manual MCP setup before the studio workflow can run.

## Agents

`.codex/agents/` adapts the five authoritative specialist personas:

| Codex agent | Authoritative source |
|---|---|
| `brainstorm-orchestrator` | `.claude/agents/brainstorm-orchestrator.md` + `.claude/commands/run-brainstorm.md` |
| `devops-diagnostician` | `.claude/agents/devops-diagnostician.md` + `.claude/commands/diagnose-studio.md` |
| `svg-artisan` | `.claude/agents/svg-artisan.md` + `.agents/skills/svg-authoring/SKILL.md` |
| `test-engineer` | `.claude/agents/test-engineer.md` + `.claude/commands/build-check.md` |
| `wiki-librarian` | `.claude/agents/wiki-librarian.md` + wiki grounding contract |

The `.codex/agents/*.toml` files carry Codex-native agent metadata, but must point back to
`.claude/commands` for procedures and `.agents/skills` for craft. A `.Codex/...` path is a
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

Do not use Claude-specific environment variables such as `CLAUDE_PROJECT_DIR` in Codex hooks.

## Coverage Honesty

The repo proves Codex adapter consistency with `tests/codex-adapter.test.mjs`: MCP config
starts from the project root, hooks are not Claude-specific, `.codex/agents` matches the
authoritative agent roster, and `.agents/skills` mirrors `.claude/skills` exactly.

Codex does not get separate copies of `.claude/commands`; agents read and execute those
plain-file procedures. That is intentional: `.claude/` remains the behavioral SSOT.
