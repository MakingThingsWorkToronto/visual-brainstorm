---
description: "Reopen a completed Visual Brainstorm thread and resume it live. Use for archived-thread recovery without regenerating history."
argument-hint: "Discussion id and optional round"
agent: "brainstorm-orchestrator"
tools: [read, search, edit, execute, agent, visual-brainstorm/*]
---
Read and follow these files in order:
- [Authoritative registry](../../.claude/agentic-surface-registry.json)
- [Copilot adapter registry](../agentic-surface-registry.json)
- [Workflow](../../.claude/commands/reopen.md)
- [Protocol reference](../../wiki/Requirements/interaction-protocol.md)

Treat `.claude` and the wiki as authoritative. Move the thread back to live discussion and resume it without regenerating any boards or artifacts.