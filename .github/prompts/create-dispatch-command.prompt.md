---
description: "Turn a plan into a loopable Visual Brainstorm dispatch command. Use when a plan needs a one-phase-per-tick dispatcher."
argument-hint: "Plan path or slug"
agent: "brainstorm-orchestrator"
tools: [read, search, edit, execute, agent, todo]
---
Read and follow these files in order:
- [Authoritative registry](../../.claude/agentic-surface-registry.json)
- [Copilot adapter registry](../agentic-surface-registry.json)
- [Workflow](../../.claude/commands/create-dispatch-command.md)
- [Agentic loop](../../wiki/Meta/agentic-loop.md)

Treat `.claude` and the wiki as authoritative. Emit the dispatcher in the repo-native format and keep the plan loopable.