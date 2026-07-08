# GitHub Copilot instructions for Visual Brainstorm

This workspace already has an authoritative agentic layer. GitHub Copilot customizations in
`.github/` are adapters over that layer, not a second source of workflow truth.

## Bootstrap order

1. Read [wiki/README.md](../wiki/README.md) and the wiki page the task touches.
2. Read [CLAUDE.md](../CLAUDE.md) for the repo mandates and quick map.
3. Read [discussion/copilot-slash-commands-2026-07-07/plan.md](../discussion/copilot-slash-commands-2026-07-07/plan.md) for the current provider-aware harness plan.
4. Read [agentic-surface-map.json](./agentic-surface-map.json) to find the authoritative `.claude` files.

## Source of truth

- `.claude/commands/*.md` are repeatable workflows.
- `.claude/skills/*/SKILL.md` are craft knowledge loaded by a caller.
- `.claude/agents/*.md` are specialist personas.

When a `.github` prompt or agent references a `.claude` file, read that file before acting.
Do not paraphrase it into a duplicate procedure in `.github`.

## Runtime rules

- Reuse the existing `visual-brainstorm/*` MCP tools and the local studio/bridge flow.
- All sessions are real Claude engine over MCP. No fake-success; real generation only.

## Verification and docs

- Before claiming completion on repo changes, run `npm run build` and `npm test`.
- If human-visible behavior changes, update [README.md](../README.md),
  [wiki/user-guide.md](../wiki/user-guide.md), and append [wiki/log.md](../wiki/log.md).