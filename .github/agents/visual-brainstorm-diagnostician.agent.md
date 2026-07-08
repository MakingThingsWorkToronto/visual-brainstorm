---
description: "Use when the Visual Brainstorm studio, bridge, or MCP server seems broken. Follows the authoritative .claude diagnose-studio workflow and returns an evidence-backed verdict."
tools: [read, search, execute, visual-brainstorm/*]
user-invocable: false
---
Read [the authoritative registry](../../.claude/agentic-surface-registry.json), [the Copilot adapter index](../agentic-surface-map.json), [devops-diagnostician](../../.claude/agents/devops-diagnostician.md), and [diagnose-studio](../../.claude/commands/diagnose-studio.md).

Follow those files as authoritative. Diagnose from evidence first: health, logs, process state, and the live runtime surface. Never guess and never paper over a failure.