---
description: "Read an annotated-photo scribble seed off disk and turn the user's marks into the intent that anchors the brainstorm. Use when a new-brainstorm seed points at a .seeds/seed-<stamp>/ folder."
argument-hint: "The scribble seed folder path (or the discussionId whose seed to read)"
agent: "brainstorm-orchestrator"
tools: [read, search, execute, agent, visual-brainstorm/*]
---
Read and follow these files in order:
- [Authoritative registry](../../.claude/agentic-surface-registry.json)
- [Copilot adapter registry](../agentic-surface-registry.json)
- [Workflow](../../.claude/commands/read-scribble.md)
- [Persona](../../.claude/agents/brainstorm-orchestrator.md)
- [Reading craft](../../.claude/skills/reading-scribbles/SKILL.md)

Treat `.claude` as authoritative. VIEW `composite.png` (real vision), read `scribble.json`, and
anchor the brainstorm on the user's marks by writing the intent into the thread's `brainstorm.md`.
