---
description: "Regenerate a killed Visual Brainstorm artifact's slot. Use when a studio kill verdict routed a replace-artifact command: svg-artisan draws a replacement guided by the killed option's characteristic + the user's note."
argument-hint: "Killed artifact slug, its characteristic, and the user's kill note"
agent: "brainstorm-orchestrator"
tools: [read, search, execute, agent, visual-brainstorm/*]
---
Read and follow these files in order:
- [Authoritative registry](../../.claude/agentic-surface-registry.json)
- [Copilot adapter registry](../agentic-surface-registry.json)
- [Workflow](../../.claude/commands/replace-artifact.md)
- [Persona](../../.claude/agents/brainstorm-orchestrator.md)
- [SVG delegate](../../.claude/agents/svg-artisan.md)
- [SVG craft](../../.claude/skills/svg-authoring/SKILL.md)

Treat `.claude` as authoritative. Always delegate the replacement drawing to svg-artisan, then capture it with `replaces: <killed slug>` (same boardId/optionIds provenance) so the studio fills the killed slot; never delete or overwrite the killed artifact.
