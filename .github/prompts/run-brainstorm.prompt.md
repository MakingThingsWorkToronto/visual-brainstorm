---
description: "Run or resume a full Visual Brainstorm session. Use for a new discussion, concierge intake, method picking, iterative SVG rounds, captures, parks, and finalization."
argument-hint: "Brief, resume request, or discussionId"
agent: "visual-brainstorm-operator"
tools: [read, search, execute, agent, todo, visual-brainstorm/*]
---
Use the chat request as the brief or resume hint.

Read and follow these files in order:
- [Agentic surface map](../agentic-surface-map.json)
- [Workflow](../../.claude/commands/run-brainstorm.md)
- [Persona](../../.claude/agents/brainstorm-orchestrator.md)
- [Phase craft](../../.claude/skills/brainstorm-phases/SKILL.md)
- [SVG craft](../../.claude/skills/svg-authoring/SKILL.md)

Treat `.claude` as the source of truth. Drive the existing `visual-brainstorm/*` MCP tools with real Claude engine.