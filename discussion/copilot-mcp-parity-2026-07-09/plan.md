# GitHub Copilot MCP startup and agentic parity

**Date:** 2026-07-09
**Scope:** Make the two repository MCP servers discoverable and startable by GitHub Copilot in VS Code; provide a GitHub-hosted Copilot configuration payload and cloud-agent setup; mirror the applicable agentic contract and hook outcomes without creating a second behavioral source of truth.
**Authority:** `CLAUDE.md` rules 1, 3, 6, 10, 11, and 12; `AGENTS.md` rules 1, 4, and 6; `wiki/Meta/conventions.md`; `wiki/System/harness-copilot.md`; official VS Code and GitHub Copilot MCP/hook configuration contracts.
**Status:** in progress

## Problem

The root `.mcp.json` uses the Claude-compatible `mcpServers` schema. VS Code GitHub Copilot
discovers workspace servers from `.vscode/mcp.json` using the `servers` schema, so it has no
durable workspace launch definition. GitHub Copilot cloud agent requires a built runtime and
either repository MCP settings or custom-agent `mcp-servers`; a local loopback studio cannot be
shown to a human from its ephemeral runner.

## Outcomes

1. Add `.vscode/mcp.json` for the local VS Code GitHub Copilot Chat path.
2. Add `.github/mcp.json` as the versioned GitHub-compatible `mcpServers` payload and configure
   the GitHub Copilot agents to use the same servers when their host supports agent MCP settings.
3. Add a cloud-agent setup workflow that installs dependencies and builds both server outputs.
4. Add native `.github/hooks/` equivalents for Claude's progress and agentic-surface outcomes,
   including a mirror guard that runs only when `CLAUDE.md` or `AGENTS.md` changes are relevant.
5. Make `.github/copilot-instructions.md` dynamically import the applicable authoritative
   `CLAUDE.md` and `AGENTS.md` mandates, with explicit host-specific exceptions.
6. Add deterministic tests, real stdio initialize probes, documentation, and a wiki log entry.

## Boundaries

- Do not claim that `.github/mcp.json` is auto-discovered by GitHub.com when the documented
  repository mechanism is repository settings or custom-agent frontmatter.
- Do not claim the full interactive studio works in a GitHub-hosted runner: it binds to that
  runner's `127.0.0.1`, not the human's browser.
- Preserve `.claude/` as behavioral SSOT; GitHub files are host adapters and checks only.

## Progress log

- 2026-07-09 — plan created after verifying the root Claude manifest, current Copilot adapter,
  Codex MCP/hook donor, official VS Code MCP/hook schema, and GitHub cloud-agent setup contract.