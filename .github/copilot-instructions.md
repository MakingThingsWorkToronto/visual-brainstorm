# GitHub Copilot instructions for Visual Brainstorm

## Authority Mirror

This file is the GitHub Copilot adapter for the repository's authoritative instructions, not a
second behavioral source of truth. Before work, read [CLAUDE.md](../CLAUDE.md) and
[AGENTS.md](../AGENTS.md) in full, then apply their relevant mandates directly. That dynamic
read is the mirror: a shared rule changes once in its source and applies to Copilot immediately.

The exceptions are host mechanics, never product behavior: `$CLAUDE_PROJECT_DIR` is replaced by
workspace-relative paths, `.github/hooks/` uses native VS Code hook events, and GitHub-hosted
Copilot cannot make the runner's loopback studio visible to the human.

## Bootstrap Order

1. Read [wiki/README.md](../wiki/README.md) and the authoritative page the task touches.
2. Read [CLAUDE.md](../CLAUDE.md), [AGENTS.md](../AGENTS.md), and any active task plan.
3. Read [the authoritative registry](../.claude/agentic-surface-registry.json) and this
     adapter's [registry](agentic-surface-registry.json).
4. Read the named `.claude` command, skill, or agent before executing its workflow.

## Shared Mandates

- The wiki is authoritative. Ground on it before acting, log every wiki edit, and reload the
    wiki MCP index after edits.
- Create a `discussion/<slug>-<date>/plan.md` before multi-step implementation. Keep work
    surgical, trace every changed line to the request, and do not silently repair unrelated work.
- `packages/protocol` owns message shapes. No fake success, fabricated provider output, or
    unproven runtime claim is acceptable.
- Capture user-facing SVG artifacts with provenance, sanitize untrusted SVG before rendering,
    and preserve append-only thread memory.
- Route work through the named specialist agents and authoritative `.claude` procedures; do not
    duplicate workflow logic in `.github`.
- Prove changes with the narrowest useful check, then `npm run build` and `npm test` before
    completion. Update [README.md](../README.md), [wiki/user-guide.md](../wiki/user-guide.md),
    the relevant wiki facts, and [wiki/log.md](../wiki/log.md) when behavior changes.
- Reconcile supported harness adapters whenever an authoritative workflow, protocol contract, or
    user-visible harness behavior changes. Preserve and work with concurrent edits.

## GitHub Copilot MCP Route

- **VS Code Copilot Chat:** `.vscode/mcp.json` is the discoverable workspace manifest. It starts
    both servers with the repository as `cwd`; after dependencies are installed and `npm run build`
    succeeds, trust and start them through **MCP: List Servers**. This is the fully interactive
    local path: the studio binds to the user's local `127.0.0.1`.
- **GitHub-hosted Copilot:** `.github/mcp.json` is the versioned, GitHub-compatible
    `mcpServers` payload. GitHub.com does not auto-discover that file: the equivalent runtime
    configuration is supplied by this adapter's agent-scoped `mcp-servers` declarations or by
    copying the payload into repository **Settings → Copilot → MCP servers**. The
    [setup workflow](workflows/copilot-setup-steps.yml) installs dependencies and builds `dist`.
- **Hosted limitation:** GitHub-hosted Copilot starts stdio servers inside an ephemeral Actions
    runner. It can use noninteractive MCP and wiki operations, but it cannot deliver the local
    browser studio or collect a human board response. Do not claim that `open_studio`,
    `ask_concierge`, `present_gallery`, or `present_board` completed an interactive brainstorm
    there. Explain the boundary and use local VS Code Copilot Chat for the real studio journey.
- The active GitHub-hosted model is Copilot, not Claude. Do not describe a Copilot-hosted tool
    call as a Claude-engine run merely because the existing product runtime metadata says Claude.

## Hooks And Mirror Guard

`.github/hooks/visual-brainstorm.json` mirrors the Claude outcomes using native Copilot events:
product MCP/subagent work forwards progress, file mutations run the agentic-surface guard, and
edits to `CLAUDE.md`, `AGENTS.md`, `.github/`, or `.vscode/` run the Copilot parity guard. The
guard verifies this dynamic authority mirror and the manifests, agents, hooks, and setup flow;
unrelated edits do not pay the check. `.vscode/settings.json` disables automatic loading of
`.claude/settings.json` in VS Code so its matcher-ignored hooks cannot double-run.