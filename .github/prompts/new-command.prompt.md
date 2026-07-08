---
description: "Codify recurring work as a new Visual Brainstorm command. Use when the same manual procedure has been needed twice."
argument-hint: "Recurring task to codify"
agent: "visual-brainstorm-operator"
tools: [read, search, edit, agent, todo]
---
Read and follow these files in order:
- [Authoritative registry](../../.claude/agentic-surface-registry.json)
- [Copilot adapter index](../agentic-surface-map.json)
- [Workflow](../../.claude/commands/new-command.md)
- [Skill discovery map](../../.claude/commands/discover-skills.md)

Treat `.claude` as authoritative. Add the command in `.claude/commands/`, register it in the task map, and avoid duplicating the procedure in `.github`.