---
description: "Diagnose the Visual Brainstorm studio, bridge, or MCP server. Use when anything seems broken, stale, hung, or miswired."
argument-hint: "Symptom, failing behavior, or command output"
agent: "visual-brainstorm-diagnostician"
tools: [read, search, execute, visual-brainstorm/*]
---
Read and follow these files in order:
- [Agentic surface map](../agentic-surface-map.json)
- [Workflow](../../.claude/commands/diagnose-studio.md)
- [Persona](../../.claude/agents/devops-diagnostician.md)
- [Observability reference](../../wiki/System/testing-observability.md)

Return an evidence-backed diagnosis. Do not restart blindly and do not guess.