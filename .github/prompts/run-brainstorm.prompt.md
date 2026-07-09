---
description: "Run or resume a full Visual Brainstorm session. Use for a new discussion, concierge intake, method picking, iterative SVG rounds, captures, parks, and finalization."
argument-hint: "Brief, resume request, or discussionId"
agent: "brainstorm-orchestrator"
tools: [read, search, execute, agent, todo, visual-brainstorm/*]
---
Use the chat request as the brief or resume hint.

Read and follow these files in order:
- [Authoritative registry](../../.claude/agentic-surface-registry.json)
- [Copilot adapter registry](../agentic-surface-registry.json)
- [Workflow](../../.claude/commands/run-brainstorm.md)
- [Persona](../../.claude/agents/brainstorm-orchestrator.md)
- [Phase craft](../../.claude/skills/brainstorm-phases/SKILL.md)
- [SVG judge reference](../../.claude/skills/svg-authoring/VALIDITY-SCAN.md) (the full SKILL.md is the svg-artisan's load, not the operator's)

Treat `.claude` as the source of truth. Drive the existing `visual-brainstorm/*` MCP tools with real Claude engine.